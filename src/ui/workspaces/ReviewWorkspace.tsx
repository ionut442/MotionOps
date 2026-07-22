import { ReviewWorkspace as RealReviewWorkspace } from "../ReviewWorkspace";
import { createRequestId, sendToPlugin } from "./shim";

export const ReviewWorkspace = () => (
  <RealReviewWorkspace activeScope={null} createRequestId={createRequestId} lastMessage={null} onContextDrawerChange={() => undefined} sendToPlugin={sendToPlugin} />
);
