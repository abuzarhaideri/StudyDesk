import type { StudyDeskAPI } from "../../shared/domain";
declare global {
  interface Window {
    studyDesk: StudyDeskAPI;
  }
}
