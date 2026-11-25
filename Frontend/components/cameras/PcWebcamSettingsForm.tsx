"use client";

import PcWebcamConfigFields from "@/components/cameras/PcWebcamConfigFields";
import type { PcWebcamConfigView } from "@/hooks/usePcWebcamConfig";
import type { PcWebcamConfig } from "@/types/pc-webcam";

interface PcWebcamSettingsFormProps {
  config: PcWebcamConfigView;
  saving?: boolean;
  onSave: (config: PcWebcamConfig) => Promise<{ ok: boolean; message: string }>;
  compact?: boolean;
  showPlacementFields?: boolean;
}

export default function PcWebcamSettingsForm({
  showPlacementFields = true,
  ...props
}: PcWebcamSettingsFormProps) {
  return (
    <PcWebcamConfigFields
      {...props}
      autoSaveOnSelect={false}
      showSaveButton
      showPlacementFields={showPlacementFields}
    />
  );
}
