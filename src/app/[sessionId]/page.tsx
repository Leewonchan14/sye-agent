import { ChatShell } from "@/components/chat";

const SessionPage = async ({ params }: { params: Promise<{ sessionId: string }> }) => {
  const { sessionId } = await params;
  return <ChatShell sessionId={sessionId} />;
};

export default SessionPage;
