import { connectToDatabase } from "@/lib/database";
import Event from "@/lib/database/models/event.model";
import Order from "@/lib/database/models/order.model";
import User from "@/lib/database/models/user.model";
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";

type HyperswitchWebhook = {
  event_id: string;
  event_type: string;
  timestamp?: string;
  content?: {
    type?: string;
    object?: {
      payment_id?: string;
      status?: string;
      amount?: number;
      amount_received?: number;
      created?: string;
      metadata?: {
        eventId?: string;
        buyerId?: string;
      };
    };
  };
};

function verifySignature(
  rawBody: string,
  receivedSignature: string,
  secret: string,
) {
  const expected = createHmac("sha512", secret)
    .update(rawBody, "utf8")
    .digest();

  const received = Buffer.from(receivedSignature.trim(), "hex");

  if (received.length !== expected.length) {
    return false;
  }

  // Use ArrayBuffer-backed Uint8Arrays to avoid
  // the Buffer<ArrayBufferLike> TypeScript incompatibility.
  const expectedBytes = new Uint8Array(new ArrayBuffer(expected.length));

  const receivedBytes = new Uint8Array(new ArrayBuffer(received.length));

  for (let i = 0; i < expected.length; i++) {
    expectedBytes[i] = expected[i];
    receivedBytes[i] = received[i];
  }

  return timingSafeEqual(expectedBytes, receivedBytes);
}

export async function POST(request: Request) {
  try {
    // 1. Read the raw body. Do not call request.json() before verification.
    const rawBody = await request.text();

    // 2. Verify Hyperswitch signature.
    const signature = request.headers.get("x-webhook-signature-512");
    const webhookSecret = process.env.HYPERSWITCH_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("Missing HYPERSWITCH_WEBHOOK_SECRET");
      return NextResponse.json(
        { message: "Webhook configuration error" },
        { status: 500 },
      );
    }

    if (!signature) {
      return NextResponse.json(
        { message: "Missing webhook signature" },
        { status: 401 },
      );
    }

    if (!verifySignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json(
        { message: "Invalid webhook signature" },
        { status: 401 },
      );
    }

    // 3. Parse the verified payload.
    const webhook = JSON.parse(rawBody) as HyperswitchWebhook;

    const eventType = webhook.event_type;
    const payment = webhook.content?.object;

    console.log("Hyperswitch webhook received:", {
      eventId: webhook.event_id,
      eventType,
    });

    // 4. Only create orders after successful payment/capture.
    if (eventType !== "payment_succeeded" && eventType !== "payment_captured") {
      return NextResponse.json({
        message: "Webhook event ignored",
        eventType,
      });
    }

    if (webhook.content?.type !== "payment_details" || !payment?.payment_id) {
      return NextResponse.json(
        { message: "Invalid payment webhook payload" },
        { status: 400 },
      );
    }

    // 5. Get event and buyer IDs from the signed payment metadata.
    const eventId = payment.metadata?.eventId;
    const buyerId = payment.metadata?.buyerId;

    if (
      !eventId ||
      !buyerId ||
      !ObjectId.isValid(eventId) ||
      !ObjectId.isValid(buyerId)
    ) {
      return NextResponse.json(
        { message: "Invalid event or buyer metadata" },
        { status: 400 },
      );
    }

    // 6. Convert EUR minor units (cents) to a decimal amount.
    const amount = payment.amount_received ?? payment.amount;

    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { message: "Invalid payment amount" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    // 7. Ensure the referenced records exist.
    const [event, buyer] = await Promise.all([
      Event.exists({ _id: eventId }),
      User.exists({ _id: buyerId }),
    ]);

    if (!event || !buyer) {
      // Return 500 so Hyperswitch can retry if DB records
      // are temporarily unavailable.
      throw new Error("Event or buyer was not found.");
    }

    // 8. Idempotent order creation.
    // A repeated webhook for the same payment will not create
    // another order, provided the unique index below exists.
    const result = await Order.updateOne(
      { hyperswitchPaymentId: payment.payment_id },
      {
        $setOnInsert: {
          hyperswitchPaymentId: payment.payment_id,
          event: eventId,
          buyer: buyerId,
          totalAmount: (amount / 100).toFixed(2),
          createdAt: payment.created
            ? new Date(payment.created)
            : webhook.timestamp
              ? new Date(webhook.timestamp)
              : new Date(),
        },
      },
      { upsert: true },
    );

    return NextResponse.json({
      message: "Webhook processed",
      duplicate: result.upsertedCount === 0,
      paymentId: payment.payment_id,
    });
  } catch (error) {
    console.error("Hyperswitch webhook failed:", error);

    return NextResponse.json(
      { message: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
