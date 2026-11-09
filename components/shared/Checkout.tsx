"use client";

import { loadHyper } from "@juspay-tech/hyper-js";
import {
  HyperElements,
  UnifiedCheckout,
  useElements,
  useHyper,
} from "@juspay-tech/react-hyper-js";
import { checkoutOrder, createFreeOrder } from "@/lib/actions/order.actions";
import { IEvent } from "@/lib/database/models/event.model";
import { FormEvent, useState } from "react";
import { Button } from "../ui/button";

// Initialize Hyperswitch using your publishable key.
const hyperPromise = loadHyper(
  process.env.NEXT_PUBLIC_HYPERSWITCH_PUBLISHABLE_KEY!,
);

const HyperswitchPaymentForm = () => {
  const hyper = useHyper();
  const elements = useElements();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!hyper || !elements) {
      setError("Payment system is not ready. Please try again.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      const result = await hyper.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment/return`,
        },
        redirect: "always",
      });

      if (result?.error) {
        setError(result.error.message || "Payment failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <UnifiedCheckout options={{ layout: "tabs" }} />

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="button"
        disabled={loading || !hyper || !elements}
      >
        {loading ? "Processing..." : "Pay Now"}
      </Button>
    </form>
  );
};

const Checkout = ({ event }: { event: IEvent }) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [freeBooked, setFreeBooked] = useState(false);

  const onCheckout = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError("");

      // Free events don't require a payment gateway.
      if (event.isFree) {
        await createFreeOrder(event._id.toString());
        setFreeBooked(true);
        return;
      }

      // Create the payment on your server.
      const payment = await checkoutOrder({
        eventId: event._id.toString(),
      });

      if (!payment?.clientSecret) {
        throw new Error("Unable to initialize payment.");
      }

      setClientSecret(payment.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setLoading(false);
    }
  };

  if (freeBooked) {
    return (
      <p className="text-green-600">Your free ticket has been reserved!</p>
    );
  }

  if (clientSecret) {
    return (
      <div className="w-full max-w-xl space-y-5">
        <h3 className="text-xl font-semibold">Complete your payment</h3>

        <HyperElements hyper={hyperPromise} options={{ clientSecret }}>
          <HyperswitchPaymentForm />
        </HyperElements>
      </div>
    );
  }

  return (
    <form onSubmit={onCheckout}>
      {error && (
        <p className="mb-3 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="button sm:w-fit"
        disabled={loading}
      >
        {loading
          ? "Please wait..."
          : event.isFree
            ? "Get Ticket"
            : "Buy Ticket"}
      </Button>
    </form>
  );
};

export default Checkout;
