import { contextBridge, ipcRenderer } from "electron";
import type { StudyDeskAPI } from "../../shared/domain";
const api: StudyDeskAPI = {
  load: () => ipcRenderer.invoke("load"),
  dispatch: (command) => ipcRenderer.invoke("dispatch", command),
  backup: (action) => ipcRenderer.invoke("backup", action),
  subscribe: (listener) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: Parameters<typeof listener>[0],
    ) => listener(state);
    ipcRenderer.on("state", handler);
    return () => ipcRenderer.removeListener("state", handler);
  },
};
contextBridge.exposeInMainWorld("studyDesk", api);
