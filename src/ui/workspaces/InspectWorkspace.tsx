import { InspectWorkspace as RealInspectWorkspace } from "../InspectWorkspace";
import { createRequestId, sendToPlugin } from "./shim";

export const InspectWorkspace = () => (
  <RealInspectWorkspace activeScope={null} createRequestId={createRequestId} lastMessage={null} sendToPlugin={sendToPlugin} />
);
