import { Outlet, useNavigate } from 'react-router-dom';
import ScenarioList from './ScenarioList';
import useOuterClick from 'renderer/hooks/useOuterClick';
import { InvokeChannel } from 'ipc';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { Status } from 'types/status';
import { useCurrentLab } from 'renderer/hooks/useCurrent';
import labsAtom from '../../atoms/labs';
import dockerAtom from 'renderer/atoms/docker';
import statusAtom from 'renderer/atoms/status';
import progressAtom from '../../atoms/progress';

const Root = () => {
  const navigate = useNavigate();
  const [labs, updateLabs] = useRecoilState(labsAtom);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const outletRef = useRef<HTMLDivElement>(null);
  const [drawerMode, setDrawerMode] = useState(false);
  const [needsImagePull, setNeedsImagePull] = useState(false);
  const dockerStatus = useRecoilValue(dockerAtom);
  const updateStatus = useSetRecoilState<Status>(statusAtom);
  const [imagePullInProgress, setImagePullInProgress] = useState(false);
  const [progressRecords, setProgressRecords] = useRecoilState(progressAtom);

  const lab = useCurrentLab();

  const drawerRef = useOuterClick<HTMLDivElement>(() => {
    if (drawerMode) {
      gsap.to(sidebarRef.current, { duration: 0.5, left: -320 });
      // eslint-disable-next-line promise/catch-or-return
      gsap
        .to(drawerRef.current, { duration: 0.5, left: 0 })
        .delay(0.5)
        .then(() => {
          setDrawerMode(false);
        });
    }
  });

  const startLab = async () => {
    // TODO: Add continuation support

    updateLabs({
      ...labs,
      isInProgress: true,
    });
    navigate(`/lab/${lab.id}/scenario/${lab.scenarios[0].id}`);

    gsap.to(sidebarRef.current, { duration: 0.5, left: -320 });
    // eslint-disable-next-line promise/catch-or-return
    gsap.to(outletRef.current, { duration: 0.5, left: 32 }).then(() => {
      gsap.to(drawerRef.current, { duration: 0.5, left: 0 });
      setDrawerMode(true);
    });
  };

  const openScenarioList = () => {
    setDrawerMode(true);
    gsap.to(sidebarRef.current, { duration: 0.5, left: 0 });
    gsap.to(drawerRef.current, { duration: 0.5, left: -32 });
  };

  const pullImage = () => {
    setImagePullInProgress(true);
    const [image, tag] = lab.container.image.split(':');
    InvokeChannel('docker:pull', { imageName: image, tag }, ({ status, currentProgress, totalProgress }) => {
      updateStatus({
        icon: 'download',
        message: status,
        currentProgress,
        totalProgress,
      });
    })
      .then(() => {
        setNeedsImagePull(false);
        setImagePullInProgress(false);
        updateStatus({ icon: 'check', message: '', currentProgress: 0, totalProgress: 0 });
      })
      .catch(error => {
        console.warn(error);
        setImagePullInProgress(false);
        setNeedsImagePull(true);
        updateStatus({ icon: 'triangle-exclamation', message: '', currentProgress: 0, totalProgress: 0 });
      });
  };

  useEffect(() => {
    const init = async () => {
      setProgressRecords(await InvokeChannel('progress:load', { labId: lab.id }));
      try {
        await InvokeChannel('docker:inspect', { imageName: lab.container.image });
        // TODO: Show image information
        setNeedsImagePull(false);
      } catch (error) {
        setNeedsImagePull(true);
      }
    };
    init();
  }, [lab, setProgressRecords]);

  return (
    <div className="h-full w-full">
      <div
        ref={drawerRef}
        className="absolute left-[-32px] top-4 w-[32px] rounded bg-container py-4 text-gray-400 pt-2 flex flex-col items-center cursor-pointer"
      >
        <button type="button" onClick={openScenarioList}>
          <i className="fa-solid fa-angles-right" />
          <p className="[writing-mode:vertical-lr] mt-2">{lab.title}</p>
        </button>
      </div>

      <div ref={outletRef} className="absolute left-[352px] top-4 right-4 bottom-0 overflow-scroll no-scrollbar pl-2">
        <Outlet />
      </div>

      <div ref={sidebarRef} className="w-[320px] absolute left-0 top-4">
        <ScenarioList
          lab={lab}
          drawerMode={drawerMode}
          needsImagePull={needsImagePull}
          dockerEngineUnavailable={!dockerStatus.connected}
          disabled={imagePullInProgress}
          progressRecords={progressRecords}
          onStartLabClick={startLab}
          onPullImageClick={pullImage}
        />
      </div>
    </div>
  );
};

export default Root;
