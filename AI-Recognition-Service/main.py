import argparse

import json

import logging

import signal

import sys



from pipeline import RecognitionPipeline

from recognition import sync_embeddings



SYNC_RESULT_MARKER = "__SYNC_RESULT__"





def configure_logging() -> None:

    logging.basicConfig(

        level=logging.INFO,

        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",

    )





def main() -> int:

    configure_logging()

    parser = argparse.ArgumentParser(description="AI Attendance Recognition Service")

    parser.add_argument(

        "--sync-embeddings",

        action="store_true",

        help="Generate embeddings from registered employee images and exit",

    )

    parser.add_argument(

        "--camera-id",

        type=int,

        default=None,

        help="Process only one camera id",

    )

    parser.add_argument(

        "--employee-id",

        type=int,

        default=None,

        help="Generate embeddings for one employee only",

    )

    args = parser.parse_args()



    if args.sync_embeddings:

        result = sync_embeddings(employee_id=args.employee_id)

        print(f"{SYNC_RESULT_MARKER}{json.dumps(result)}", flush=True)



        images = int(result.get("images_processed") or 0)

        written = int(result.get("embeddings_created") or 0) + int(

            result.get("embeddings_updated") or 0

        )

        covered = int(result.get("employees_covered") or 0)



        if images > 0 and written == 0:

            return 1

        if args.employee_id and images > 0 and covered == 0:

            return 1

        return 0



    pipeline = RecognitionPipeline(camera_id=args.camera_id)



    def handle_stop(signum, frame):

        logging.getLogger(__name__).info("Stopping service (%s)", signum)

        pipeline.stop()

        sys.exit(0)



    signal.signal(signal.SIGINT, handle_stop)

    signal.signal(signal.SIGTERM, handle_stop)



    pipeline.run()

    return 0





if __name__ == "__main__":

    raise SystemExit(main())


