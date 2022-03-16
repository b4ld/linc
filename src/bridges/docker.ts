/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-shadow */

import { Bridge } from 'ipc/ipc-handler';
import Docker from 'dockerode';
import path from 'path';
import { app } from 'electron';
import * as stream from 'stream';

const labsPath = path.join(app.getPath('userData'), 'labwiz', 'labs');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const connect: Bridge<void, void, { success: boolean }> = async (_, channel) => {
  setInterval(async () => {
    try {
      const reply = Buffer.from(await docker.ping()).toString();
      channel.notify({ success: reply === 'OK' });
    } catch (error) {
      channel.notify({ success: false });
    }
  }, 5000);
};

const inspect: Bridge<{ imageName: string }, unknown> = async ({ imageName }, channel) => {
  try {
    const image = docker.getImage(imageName);
    const inspectInfo = await image.inspect();
    channel.reply(inspectInfo);
  } catch (error) {
    channel.error(new Error('IMAGE_NOT_FOUND'));
  }
};

const pull: Bridge<
  { imageName: string },
  void,
  { status: string; currentProgress: number; totalProgress: number }
> = async ({ imageName }, channel) => {
  docker.pull(imageName, {}, (err: Error, containerStream: any) => {
    if (err) {
      channel.error(err);
    }

    docker.modem.followProgress(
      containerStream,
      error => {
        if (error) {
          channel.error(err);
        }
        channel.reply();
      },
      event => {
        channel.notify({
          status: event.status,
          currentProgress: event.progressDetail ? event.progressDetail.current : 0,
          totalProgress: event.progressDetail ? event.progressDetail.total : 0,
        });
      }
    );
  });
};

const create: Bridge<
  { imageName: string; volumeBindings: { source: string; target: string }[] },
  { containerId: string }
> = async ({ imageName, volumeBindings }, channel) => {
  // eslint-disable-next-line @typescript-eslint/ban-types
  const volumes: { [key: string]: {} } = {};
  const hostConfig: { [key: string]: string[] } = {};
  hostConfig.Binds = [];

  volumeBindings.forEach(b => {
    volumes[b.target] = {};
    const hostPath = `${labsPath}/${b.source}`;
    hostConfig.Binds.push(`${hostPath}:${b.target}`);
  });

  const options = {
    Hostname: '',
    User: '',
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    OpenStdin: true,
    StdinOnce: false,
    Env: [],
    Cmd: ['bash'],
    Image: imageName,
    Volumes: volumes,
    HostConfig: hostConfig,
  };
  const container = await docker.createContainer(options);

  container.start(err => {
    if (err) {
      channel.error(err);
      return;
    }
    container.wait(err => {
      if (err) {
        channel.error(err);
        return;
      }
      // TODO: Exit container
      console.log('exit container');
    });
    channel.reply({ containerId: container.id });
  });
};

const exec: Bridge<
  { containerId: string; shell: string; script: string },
  { success: boolean; output: string }
> = async ({ containerId, shell, script }, channel) => {
  const container = docker.getContainer(containerId);
  const execOptions = {
    Cmd: [shell, script],
    AttachStdout: true,
    AttachStderr: true,
  };

  const responsePayload = { output: '', success: true };

  const out = new stream.Writable({
    write(chunk, _encoding, next) {
      responsePayload.output += chunk.toString();
      next();
    },
  });

  const exec = await container.exec(execOptions);
  const execStream = await exec.start({ Detach: false });
  container.modem.demuxStream(execStream, out, out);

  const interval = setInterval(async () => {
    const inspectInfo = await exec.inspect();
    if (inspectInfo.ExitCode !== null) {
      responsePayload.success = inspectInfo.ExitCode === 0;
      channel.reply(responsePayload);
      clearInterval(interval);
    }
  }, 1000);
};

export default {
  'docker:connect': connect,
  'docker:inspect': inspect,
  'docker:pull': pull,
  'docker:create': create,
  'docker:exec': exec,
};
