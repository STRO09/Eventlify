import { Document, Schema, Types, model, models } from "mongoose";

export interface IOrder extends Document {
  createdAt: Date;
  hyperswitchPaymentId: string;
  totalAmount: string;

  event:
    | Types.ObjectId
    | {
        _id: Types.ObjectId;
        title: string;
      };

  buyer:
    | Types.ObjectId
    | {
        _id: Types.ObjectId;
        firstName: string;
        lastName: string;
      };
}

export type IOrderItem = {
  _id: string;
  totalAmount: string;
  createdAt: Date;
  eventTitle: string;
  eventId: string;
  buyer: string;
};

const OrderSchema = new Schema({
  createdAt: {
    type: Date,
    default: Date.now,
  },

  hyperswitchPaymentId: {
    type: String,
    required: true,
  },

  totalAmount: {
    type: String,
    required: true,
  },

  event: {
    type: Schema.Types.ObjectId,
    ref: "Event",
    required: true,
  },

  buyer: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

// Prevent duplicate orders for the same Hyperswitch payment.
OrderSchema.index(
  { hyperswitchPaymentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      hyperswitchPaymentId: { $type: "string" },
    },
  },
);

const Order = models.Order || model<IOrder>("Order", OrderSchema);

export default Order;
