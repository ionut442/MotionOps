import { ScopeWorkspace as RealScopeWorkspace } from "../ScopeWorkspace";
import { createRequestId, sendToPlugin } from "./shim";

export const ScopeWorkspace = () => (
  <RealScopeWorkspace createRequestId={createRequestId} lastMessage={null} sendToPlugin={sendToPlugin} />
);
