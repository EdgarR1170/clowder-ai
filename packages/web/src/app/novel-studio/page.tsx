import '../globals.css';
import { NovelStudioWorkbench } from '@/components/novel-studio/NovelStudioWorkbench';
import { SessionBootstrap } from '@/components/SessionBootstrap';

export default function NovelStudioStandalonePage() {
  return (
    <>
      <SessionBootstrap />
      <main className="h-screen w-screen overflow-hidden">
        <NovelStudioWorkbench />
      </main>
    </>
  );
}
