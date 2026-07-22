import { SequenceWorkspace as RealSequenceWorkspace } from "../SequenceWorkspace";
import { createRequestId, sendToPlugin } from "./shim";

export const SequenceWorkspace = () => (
  <RealSequenceWorkspace activeScope={null} createRequestId={createRequestId} lastMessage={null} onContextDrawerChange={() => undefined} sendToPlugin={sendToPlugin} />
);
