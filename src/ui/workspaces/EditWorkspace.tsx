import { EditWorkspace as RealEditWorkspace } from "../EditWorkspace";
import { createRequestId, sendToPlugin } from "./shim";

export const EditWorkspace = () => (
  <RealEditWorkspace activeScope={null} createRequestId={createRequestId} lastMessage={null} onContextDrawerChange={() => undefined} sendToPlugin={sendToPlugin} />
);
