import proxy from "../../server/preview-proxy.js";
export default proxy.createHandler();
export const config = { path: "/api/file-preview" };
