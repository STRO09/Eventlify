import { createUser, deleteUser, updateUser } from "@/lib/actions/user.actions";
import { clerkClient, WebhookEvent } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { Webhook } from "svix";

export async function POST(req: Request) {
  try {
    const endpointSecret = process.env.WEBHOOK_SECRET;

    if (!endpointSecret) {
      throw new Error("Missing WEBHOOK_SECRET");
    }

    // Preserve the exact request body for Svix verification.
    const body = await req.text();

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response("Missing Svix headers", { status: 400 });
    }

    const wh = new Webhook(endpointSecret);

    const evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;

    const eventType = evt.type;

    if (eventType === "user.created") {
      const {
        id,
        first_name,
        last_name,
        username,
        email_addresses,
        primary_email_address_id,
        image_url,
      } = evt.data;

      const primaryEmail =
        email_addresses.find((email) => email.id === primary_email_address_id)
          ?.email_address ?? email_addresses[0]?.email_address;

      if (!primaryEmail) {
        throw new Error(`No email address found for Clerk user ${id}`);
      }

      const user = await createUser({
        clerkId: id,
        firstName: first_name || "User",
        lastName: last_name || "Unknown",
        username: username || `user_${id.slice(-8)}`,
        email: primaryEmail,
        photo: image_url,
      });

      const client = await clerkClient();

      await client.users.updateUserMetadata(id, {
        publicMetadata: {
          userId: user._id,
        },
      });

      console.log("MongoDB user created/synced:", id);

      return NextResponse.json({ message: "User created", user });
    }

    if (eventType === "user.updated") {
      const { id, image_url, first_name, last_name, username } = evt.data;

      const updatedUser = await updateUser(id, {
        firstName: first_name || "User",
        lastName: last_name || "Unknown",
        username: username || `user_${id.slice(-8)}`,
        photo: image_url,
      });

      return NextResponse.json({ message: "User updated", user: updatedUser });
    }

    if (eventType === "user.deleted") {
      const { id } = evt.data;

      if (id) {
        const deletedUser = await deleteUser(id);
        return NextResponse.json({
          message: "User deleted",
          user: deletedUser,
        });
      }
    }

    return NextResponse.json({ message: "Event ignored" });
  } catch (error) {
    console.error("Clerk webhook failed:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Webhook processing failed",
      },
      { status: 500 },
    );
  }
}
