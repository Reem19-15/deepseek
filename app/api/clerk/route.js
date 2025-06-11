import { Webhook } from "svix";
import { headers } from "next/headers";
import connectDB from "@/config/db";
import User from "@/models/User";

export async function POST(req) {
  console.log("Clerk webhook POST request received on Vercel!"); // Add this
  console.log(
    "Vercel process.env.SIGNING_SECRET:",
    process.env.SIGNING_SECRET ? "Loaded" : "NOT LOADED"
  ); // Add this

  const WEBHOOK_SECRET = process.env.SIGNING_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("WEBHOOK_SECRET is not set in environment variables."); // Add this
    return new Response("WEBHOOK_SECRET is not set", { status: 500 });
  }

  // Get the headers
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error("Missing Svix headers."); // Add this
    return new Response("Error occured -- no svix headers", { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
    console.log("Webhook verified successfully!"); // Add this
  } catch (err) {
    console.error("Error verifying webhook:", err.message); // Add this
    return new Response("Error occured", { status: 400 });
  }

  // Get the ID and type
  const { id, object, type, data } = evt;
  console.log(`Received Clerk event: ${type}`); // Add this
  console.log("Event data:", data); // Add this (be cautious with sensitive data in production logs)

  if (object === "event") {
    try {
      await connectDB(); // Ensure DB connection is attempted
      console.log("DB connection attempted for Clerk webhook."); // Add this

      if (type === "user.created" || type === "user.updated") {
        const { id, first_name, last_name, email_addresses, image_url } = data;
        const email = email_addresses[0].email_address;
        const name = `${first_name || ""} ${last_name || ""}`.trim();

        console.log("Attempting to save/update user in DB:", {
          _id: id,
          name,
          email,
          image: image_url,
        }); // Add this
        await User.findOneAndUpdate(
          { _id: id },
          {
            name: name || "Anonymous User", // Fallback name
            email,
            image: image_url,
          },
          { upsert: true, new: true }
        );
        console.log(`User ${id} (${type}) successfully processed in DB.`); // Add this
      } else if (type === "user.deleted") {
        const { id } = data;
        console.log(`Attempting to delete user ${id} from DB.`); // Add this
        await User.findOneAndDelete({ _id: id });
        console.log(`User ${id} successfully deleted from DB.`); // Add this
      }
      return new Response("User processed", { status: 200 });
    } catch (dbError) {
      console.error("Database operation failed for Clerk webhook:", dbError); // Add this
      return new Response("Error updating user in database", { status: 500 });
    }
  }

  return new Response("OK", { status: 200 });
}
