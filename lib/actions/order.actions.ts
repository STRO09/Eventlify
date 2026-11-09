"use server";

import {
  CheckoutOrderParams,
  CreateOrderParams,
  GetOrdersByEventParams,
  GetOrdersByUserParams,
} from "@/types";
import { auth } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../database";
import Event from "../database/models/event.model";
import Order from "../database/models/order.model";
import User from "../database/models/user.model";
import { handleError } from "../utils";

type HyperswitchPaymentResponse = {
  payment_id?: string;
  client_secret?: string;
  status?: string;
  message?: string;
  error?: string | { message?: string };
};

export const checkoutOrder = async (order: CheckoutOrderParams) => {
  try {
    // 1. Authenticate the buyer.
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      throw new Error("You must be signed in to checkout.");
    }

    await connectToDatabase();

    // 2. Get the actual MongoDB user.
    const buyer = await User.findOne({ clerkId });

    if (!buyer) {
      throw new Error("Buyer profile not found.");
    }

    // 3. Get the event and its authoritative price from MongoDB.
    const event = await Event.findById(order.eventId);

    if (!event) {
      throw new Error("Event not found.");
    }

    // Free events should bypass the payment gateway.
    if (event.isFree) {
      return {
        isFree: true,
        eventId: event._id.toString(),
        buyerId: buyer._id.toString(),
      };
    }

    // 4. Validate the amount.
    const amount = Math.round(Number(event.price) * 100);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Invalid event price.");
    }

    // 5. Check Hyperswitch configuration.
    const apiKey = process.env.HYPERSWITCH_API_KEY;
    const baseUrl = process.env.HYPERSWITCH_BASE_URL?.replace(/\/$/, "");
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL?.replace(/\/$/, "");

    if (!apiKey || !baseUrl || !serverUrl) {
      throw new Error("Missing Hyperswitch environment variables.");
    }

    // 6. Create a payment with Hyperswitch.
    const response = await fetch(`${baseUrl}/payments`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        amount,
        currency: "EUR",
        confirm: false,
        capture_method: "automatic",
        description: event.title,
        return_url: `${serverUrl}/payment/return`,
        metadata: {
          eventId: event._id.toString(),
          buyerId: buyer._id.toString(),
        },
      }),
    });

    const payment = (await response.json()) as HyperswitchPaymentResponse;

    if (!response.ok) {
      const providerError =
        typeof payment.error === "string"
          ? payment.error
          : payment.error?.message;

      throw new Error(
        providerError ||
          payment.message ||
          "Unable to create Hyperswitch payment.",
      );
    }

    if (!payment.client_secret || !payment.payment_id) {
      throw new Error("Invalid response received from Hyperswitch.");
    }

    // 7. Return these values to the checkout frontend.
    return {
      isFree: false,
      paymentId: payment.payment_id,
      clientSecret: payment.client_secret,
      amount,
      currency: "EUR",
    };
  } catch (error) {
    handleError(error);
  }
};

// CREATE ORDER
export const createOrder = async (order: CreateOrderParams) => {
  try {
    await connectToDatabase();

    const newOrder = await Order.create({
      ...order,
      event: order.eventId,
      buyer: order.buyerId,
    });

    return JSON.parse(JSON.stringify(newOrder));
  } catch (error) {
    handleError(error);
  }
};

// GET ORDERS BY EVENT
export async function getOrdersByEvent({
  searchString,
  eventId,
}: GetOrdersByEventParams) {
  try {
    await connectToDatabase();

    if (!eventId) {
      throw new Error("Event ID is required.");
    }

    if (!ObjectId.isValid(eventId)) {
      throw new Error("Invalid event ID.");
    }

    const eventObjectId = new ObjectId(eventId);

    const orders = await Order.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "buyer",
          foreignField: "_id",
          as: "buyer",
        },
      },
      {
        $unwind: "$buyer",
      },
      {
        $lookup: {
          from: "events",
          localField: "event",
          foreignField: "_id",
          as: "event",
        },
      },
      {
        $unwind: "$event",
      },
      {
        $project: {
          _id: 1,
          totalAmount: 1,
          createdAt: 1,
          eventTitle: "$event.title",
          eventId: "$event._id",
          buyer: {
            $concat: ["$buyer.firstName", " ", "$buyer.lastName"],
          },
        },
      },
      {
        $match: {
          $and: [
            { eventId: eventObjectId },
            {
              buyer: {
                $regex: RegExp(searchString, "i"),
              },
            },
          ],
        },
      },
    ]);

    return JSON.parse(JSON.stringify(orders));
  } catch (error) {
    handleError(error);
  }
}

// GET ORDERS BY USER
export async function getOrdersByUser({
  userId,
  limit = 3,
  page,
}: GetOrdersByUserParams) {
  try {
    await connectToDatabase();

    const currentPage = Math.max(1, Number(page) || 1);
    const skipAmount = (currentPage - 1) * limit;

    const conditions = { buyer: userId };

    const orders = await Order.find(conditions)
      .sort({ createdAt: "desc" })
      .skip(skipAmount)
      .limit(limit)
      .populate({
        path: "event",
        model: Event,
        populate: {
          path: "organizer",
          model: User,
          select: "_id firstName lastName",
        },
      });

    const ordersCount = await Order.countDocuments(conditions);

    return {
      data: JSON.parse(JSON.stringify(orders)),
      totalPages: Math.ceil(ordersCount / limit),
    };
  } catch (error) {
    handleError(error);
  }
}

export const createFreeOrder = async (eventId: string) => {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      throw new Error("Please sign in to get a ticket.");
    }

    await connectToDatabase();

    if (!ObjectId.isValid(eventId)) {
      throw new Error("Invalid event ID.");
    }

    const [buyer, event] = await Promise.all([
      User.findOne({ clerkId }),
      Event.findById(eventId),
    ]);

    if (!buyer || !event) {
      throw new Error("User or event not found.");
    }

    if (!event.isFree) {
      throw new Error("This event requires payment.");
    }

    const order = await Order.findOneAndUpdate(
      {
        event: event._id,
        buyer: buyer._id,
        isFreeOrder: true,
      },
      {
        $setOnInsert: {
          event: event._id,
          buyer: buyer._id,
          totalAmount: "0.00",
          createdAt: new Date(),
          isFreeOrder: true,
        },
      },
      {
        new: true,
        upsert: true,
      },
    );

    return JSON.parse(JSON.stringify(order));
  } catch (error) {
    handleError(error);
  }
};
