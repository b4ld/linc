import { Outlet, useNavigate, useParams } from 'react-router-dom';
import 'renderer/App.css';
import ScenarioList from './ScenarioList';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';
import labsAtom from '../../atoms/labsAtom';
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import useOuterClick from 'renderer/hooks/useOuterClick';
import { InvokeChannel } from 'ipc';
import dockerAtom from 'renderer/atoms/docker';
import statusAtom from 'renderer/atoms/status';
import { Status } from 'types/status';

const Root = () => {
  const { labId } = useParams();
  const navigate = useNavigate();
  const [labs, updateLabs] = useRecoilState(labsAtom);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const outletRef = useRef<HTMLDivElement>(null);
  const [drawerMode, setDrawerMode] = useState(false);
  const [needsImagePull, setNeedsImagePull] = useState(false);
  const dockerStatus = useRecoilValue(dockerAtom);
  const updateStatus = useSetRecoilState<Status>(statusAtom);
  const [imagePullInProgress, setImagePullInProgress] = useState(false);

  const lab = labs.all.find(l => l.id === labId)!;

  const drawerRef = useOuterClick<HTMLDivElement>(() => {
    if (drawerMode) {
      gsap.to(sidebarRef.current, { duration: 0.5, left: -256 });
      // eslint-disable-next-line promise/catch-or-return
      gsap
        .to(drawerRef.current, { duration: 0.5, left: 0 })
        .delay(0.5)
        .then(() => {
          setDrawerMode(false);
        });
    }
  });

  const startLab = () => {
    gsap.to(sidebarRef.current, { duration: 0.5, left: -256 });
    // eslint-disable-next-line promise/catch-or-return
    gsap.to(outletRef.current, { duration: 0.5, left: 32 }).then(() => {
      updateLabs({ ...labs, isInProgress: true });
      gsap.to(drawerRef.current, { duration: 0.5, left: 0 });
      navigate(`/lab/${lab.id}/scenario/${lab.scenarios[0].id}`);
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
    InvokeChannel('docker:pull', { image, tag }, ({ status, currentProgress, totalProgress }) => {
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
    InvokeChannel('docker:inspect', { imageName: lab.container.image })
      .then(info => {
        console.log(info);
        setNeedsImagePull(false);
      })
      .catch(error => {
        console.log(error);
        setNeedsImagePull(true);
      });
  }, [lab.container.image]);

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

      <div ref={outletRef} className="absolute left-[288px] top-4 right-4 bottom-0 overflow-scroll no-scrollbar pl-2">
        <Outlet />
      </div>

      <div ref={sidebarRef} className="w-[256px] absolute left-0 top-4">
        <ScenarioList
          lab={lab}
          drawerMode={drawerMode}
          needsImagePull={needsImagePull}
          dockerEngineUnavailable={!dockerStatus.connected}
          disabled={imagePullInProgress}
          onStartLabClick={startLab}
          onPullImageClick={pullImage}
        />
      </div>
    </div>
  );
};

export default Root;
