# Render worker

The worker consumes BullMQ render jobs independently from the API. Its pipeline is: validate assets → synthesize voice → acquire licensed/generated visuals → create subtitles → compose with FFmpeg → upload through `StorageProvider` → publish WebSocket progress. Temporary files must be isolated per job and deleted in a `finally` block.
