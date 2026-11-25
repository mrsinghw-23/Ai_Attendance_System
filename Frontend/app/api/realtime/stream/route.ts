import { NextRequest } from "next/server";

import { getRealtimeEvents } from "@/services/realtime.service";



export const dynamic = "force-dynamic";



export async function GET(_request: NextRequest) {

  const encoder = new TextEncoder();



  let interval: ReturnType<typeof setInterval> | undefined;



  const stream = new ReadableStream({

    start(controller) {

      const send = () => {

        controller.enqueue(

          encoder.encode(

            `event: message\ndata: ${JSON.stringify(getRealtimeEvents())}\n\n`

          )

        );

      };



      send();

      interval = setInterval(send, 3000);

    },

    cancel() {

      if (interval) clearInterval(interval);

    },

  });



  return new Response(stream, {

    headers: {

      "Content-Type": "text/event-stream",

      "Cache-Control": "no-cache, no-transform",

      Connection: "keep-alive",

    },

  });

}


