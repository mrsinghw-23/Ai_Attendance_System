import { CameraPipelineArchitecture } from "@/types/camera";



export function getCameraPipelineArchitecture(): CameraPipelineArchitecture {

  return {

    title: "IP CCTV Recognition Pipeline",

    description:

      "Production pipeline: CP Plus / NVR RTSP cameras → InsightFace detection → face matching → face_events → attendance engine.",

    stages: [

      {

        id: "camera",

        name: "IP CCTV Camera",

        description:

          "CP Plus bullet camera or NVR channel streams RTSP video from assigned location and zone.",

        status: "active",

        output: "rtsp_stream",

      },

      {

        id: "motion_detection",

        name: "Motion Detection",

        description:

          "Optional motion gating using motion_enabled and motion_sensitivity per camera.",

        status: "active",

        output: "motion_events",

      },

      {

        id: "face_detection",

        name: "Face Detection",

        description:

          "InsightFace detects human faces in live RTSP frames from AI-Recognition-Service.",

        status: "active",

        output: "face_candidates",

      },

      {

        id: "face_recognition",

        name: "Face Recognition",

        description:

          "Matches detected faces against employee face_embeddings stored in PostgreSQL.",

        status: "active",

        output: "recognized_identity",

      },

      {

        id: "face_events",

        name: "Face Events",

        description:

          "Persists recognition results to face_events with camera_id, confidence, and timestamp (IST).",

        status: "active",

        output: "face_events",

      },

      {

        id: "attendance_engine",

        name: "Attendance Engine",

        description:

          "Processes face_events into check-in/out, IN/OUT movement, working hours, and attendance_summary.",

        status: "active",

        output: "attendance_records",

      },

    ],

    notes: [

      "Configure RTSP URL as rtsp://user:pass@NVR_IP:554/cam/realmonitor?channel=1&subtype=0 for CP Plus NVR.",

      "Direct camera RTSP uses the same URL pattern with the camera IP.",

      "Run AI-Recognition-Service: python main.py --sync-embeddings && python main.py --camera-id <id>.",

      "Health checks validate TCP reachability and RTSP configuration every minute.",

      "Entry/Exit camera type controls IN/OUT presence logs and check-out triggers.",

    ],

  };

}

