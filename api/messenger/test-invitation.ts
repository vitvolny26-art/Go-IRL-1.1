import { handleInstagramTestInvitation } from "../_shared/instagram-test-invitation.js";
import { handleMessengerTestInvitation } from "../_shared/messenger-test-invitation.js";
import { createVercelHandler } from "../_shared/vercel-handler.js";

async function handleProviderTestInvitation(request: Request) {
  const provider = new URL(request.url).searchParams.get("provider");

  if (provider === "instagram") {
    return handleInstagramTestInvitation(request);
  }

  if (provider === null || provider === "" || provider === "messenger") {
    return handleMessengerTestInvitation(request);
  }

  return new Response("Not Found", { status: 404 });
}

export default createVercelHandler(handleProviderTestInvitation);
