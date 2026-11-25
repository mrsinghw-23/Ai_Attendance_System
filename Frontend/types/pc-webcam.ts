import type { CameraEntryExitType } from "@/types/camera";

export interface PcWebcamConfig {
  display_name: string;
  location_id: number | null;
  branch_name: string;
  entrance: string;
  entry_exit_type: CameraEntryExitType;
  floor: string;
  notes: string;
}

export const DEFAULT_PC_WEBCAM_CONFIG: PcWebcamConfig = {
  display_name: "PC Webcam",
  location_id: null,
  branch_name: "",
  entrance: "",
  entry_exit_type: "ENTRY",
  floor: "",
  notes: "",
};
