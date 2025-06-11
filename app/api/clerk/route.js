import { Webhook } from "svix";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import connectDB from "@/config/db";
import User from "@/models/User";

export async function POST(req) {
  const payload = await req.text(); // Important: use .text() not .json()
  const headerPayload = headers();

  const svixHeaders = {
    "svix-id": headerPayload.get("svix-id"),
    "svix-signature": headerPayload.get("svix-signature"),
    "svix-timestamp": headerPayload.get("svix-timestamp"),
  };

  const wh = new Webhook(process.env.SIGNING_SECRET);

  let evt;
  try {
    evt = wh.verify(payload, svixHeaders); // Pass raw string here
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { data, type } = evt;

  const userData = {
    _id: data.id,
    email: data.email_addresses?.[0]?.email_address || "no-email",
    name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
    image: data.image_url || "",
  };

  await connectDB();

  switch (type) {
    case "user.created":
    case "user.updated":
      await User.findByIdAndUpdate(data.id, userData, {
        upsert: true,
        new: true,
      });
      break;
    case "user.deleted":
      await User.findByIdAndDelete(data.id);
      break;
    default:
      console.log(`Unhandled event type: ${type}`);
      break;
  }

  return NextResponse.json({ message: "✅ Event received" }, { status: 200 });
}
