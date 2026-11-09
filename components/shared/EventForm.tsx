"use client";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { eventDefaultValues } from "@/constants";
import { useUploadThing } from "@/lib/uploadthing";
import { eventFormSchema, EventFormValues } from "@/lib/validator";
import Image from "next/image";
import { useState } from "react";
import DatePicker from "react-datepicker";
import { FieldErrors, Resolver, useForm } from "react-hook-form";
import Dropdown from "./Dropdown";
import { FileUploader } from "./FileUploader";

import { createEvent, updateEvent } from "@/lib/actions/event.actions";
import { IEvent } from "@/lib/database/models/event.model";
import { useRouter } from "next/navigation";
import "react-datepicker/dist/react-datepicker.css";
import { Checkbox } from "../ui/checkbox";

type EventFormProps = {
  userId: string;
  type: "Create" | "Update";
  event?: IEvent;
  eventId?: string;
};

// Clean, compatible resolver using safeParse: works across all Zod versions without throwing uncaught errors
const zodResolverCustom: Resolver<EventFormValues> = async (values) => {
  const result = eventFormSchema.safeParse(values);

  if (result.success) {
    return {
      values: result.data,
      errors: {},
    };
  }

  const errors: Record<string, any> = {};
  const issues = result.error.issues || (result.error as any).errors || [];

  for (const issue of issues) {
    const path = issue.path.join(".");
    if (!errors[path]) {
      errors[path] = {
        type: issue.code,
        message: issue.message,
      };
    }
  }

  return {
    values: {},
    errors,
  };
};

const EventForm = ({ userId, type, event, eventId }: EventFormProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [formErrorBanner, setFormErrorBanner] = useState<string | null>(null);

  const initialValues =
    event && type === "Update"
      ? {
          ...event,
          startDateTime: new Date(event.startDateTime),
          endDateTime: new Date(event.endDateTime),
        }
      : eventDefaultValues;
  const router = useRouter();

  const { startUpload } = useUploadThing("imageUploader");

  const form = useForm<EventFormValues>({
    resolver: zodResolverCustom,
    defaultValues: initialValues,
  });

  // Triggered if any field validation fails on submission
  const onInvalid = (errors: FieldErrors<EventFormValues>) => {
    const firstError = Object.values(errors)[0];
    const message =
      (firstError?.message as string) ||
      "Please check the form fields and ensure all required information is filled out correctly.";
    setFormErrorBanner(message);
  };

  async function onSubmit(values: EventFormValues) {
    setFormErrorBanner(null);

    let uploadedImageUrl = values.imageUrl;

    if (files.length > 0) {
      const uploadedImages = await startUpload(files);

      if (!uploadedImages) {
        setFormErrorBanner("Failed to upload image. Please try again.");
        return;
      }

      uploadedImageUrl = uploadedImages[0].url;
    }

    if (!uploadedImageUrl) {
      setFormErrorBanner("Please upload an image for the event.");
      return;
    }

    if (type === "Create") {
      try {
        const newEvent = await createEvent({
          event: { ...values, imageUrl: uploadedImageUrl },
          userId,
          path: "/profile",
        });

        if (newEvent) {
          form.reset();
          router.push(`/events/${newEvent._id}`);
        }
      } catch (error) {
        console.error("Create event failed:", error);

        setFormErrorBanner(
          error instanceof Error
            ? error.message
            : "Something went wrong while creating the event.",
        );
      }
    }

    if (type === "Update") {
      if (!eventId) {
        router.back();
        return;
      }

      try {
        const updatedEvent = await updateEvent({
          userId,
          event: { ...values, imageUrl: uploadedImageUrl, _id: eventId },
          path: `/events/${eventId}`,
        });

        if (updatedEvent) {
          form.reset();
          router.push(`/events/${updatedEvent._id}`);
        }
      } catch (error) {
        console.error(error);
        setFormErrorBanner("Failed to update event. Please try again.");
      }
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, onInvalid)}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-5 md:flex-row">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Input
                    placeholder="Event title"
                    {...field}
                    className="input-field"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <Dropdown
                    onChangeHandler={field.onChange}
                    value={field.value}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-5 md:flex-row">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl className="h-72">
                  <Textarea
                    placeholder="Description"
                    {...field}
                    className="textarea rounded-2xl"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="imageUrl"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl className="h-72">
                  <FileUploader
                    onFieldChange={field.onChange}
                    imageUrl={field.value}
                    setFiles={setFiles}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-5 md:flex-row">
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <div className="flex-center h-[54px] w-full overflow-hidden rounded-full bg-grey-50 dark:bg-gray-700 px-4 py-2">
                    <Image
                      src="/assets/icons/location-grey.svg"
                      alt="location"
                      width={24}
                      height={24}
                    />

                    <Input
                      placeholder="Event location or Online"
                      {...field}
                      className="input-field"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-5 md:flex-row">
          <FormField
            control={form.control}
            name="startDateTime"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <div className="relative flex-center h-[54px] w-full rounded-full bg-grey-50 dark:bg-gray-700 px-4 py-2">
                    <Image
                      src="/assets/icons/calendar.svg"
                      alt="calendar"
                      width={24}
                      height={24}
                      className="filter-grey"
                    />
                    <p className="ml-3 whitespace-nowrap text-grey-600 dark:text-[#757575]">
                      Start Date:
                    </p>
                    <DatePicker
                      selected={field.value}
                      onChange={(date: Date | null) => field.onChange(date)}
                      showTimeSelect
                      timeInputLabel="Time:"
                      dateFormat="dd/MM/yyyy HH:mm"
                      timeFormat="HH:mm"
                      wrapperClassName="datePicker dark:text-gray-400"
                      popperPlacement="top-start"
                      popperClassName="!absolute !left-0 !top-auto !bottom-full z-50"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDateTime"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <div className="relative flex-center h-[54px] w-full rounded-full bg-grey-50 dark:bg-gray-700 px-4 py-2">
                    <Image
                      src="/assets/icons/calendar.svg"
                      alt="calendar"
                      width={24}
                      height={24}
                      className="filter-grey"
                    />
                    <p className="ml-3 whitespace-nowrap text-grey-600 dark:text-[#757575]">
                      End Date:
                    </p>
                    <DatePicker
                      selected={field.value}
                      onChange={(date: Date | null) => field.onChange(date)}
                      showTimeSelect
                      timeInputLabel="Time:"
                      dateFormat="dd/MM/yyyy HH:mm"
                      timeFormat="HH:mm"
                      wrapperClassName="datePicker dark:text-gray-400"
                      popperPlacement="top-start"
                      popperClassName="!absolute !left-0 !top-auto !bottom-full z-50"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex flex-col gap-5 md:flex-row">
          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <div className="flex-center h-[54px] w-full overflow-hidden rounded-full bg-grey-50  dark:bg-gray-700 px-4 py-2">
                    <div className="flex justify-center items-center w-full h-auto max-w-[24px]">
                      <Image
                        src="/assets/icons/euro-symbol.svg"
                        alt="euro"
                        width={20}
                        height={20}
                        className="filter-grey"
                      />
                    </div>
                    <Input
                      type="number"
                      placeholder="Price"
                      {...field}
                      className="input-price-field"
                    />
                    <FormField
                      control={form.control}
                      name="isFree"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div className="flex items-center">
                              <label
                                htmlFor="isFree"
                                className="whitespace-nowrap pr-3 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70  dark:text-gray-400"
                              >
                                Free Ticket
                              </label>
                              <Checkbox
                                onCheckedChange={field.onChange}
                                checked={field.value}
                                id="isFree"
                                className="mr-2 h-5 w-5 border-2 border-primary-500"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormControl>
                  <div className="flex-center h-[54px] w-full overflow-hidden rounded-full bg-grey-50  dark:bg-gray-700 px-4 py-2">
                    <Image
                      src="/assets/icons/link.svg"
                      alt="link"
                      width={24}
                      height={24}
                    />

                    <Input
                      placeholder="URL"
                      {...field}
                      className="input-field"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {formErrorBanner && (
          <div className="flex items-start justify-between gap-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                ⚠️ Incomplete / Invalid Form:
              </span>
              <span>{formErrorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setFormErrorBanner(null)}
              className="text-sm font-bold text-red-600 hover:text-red-800 dark:text-red-400"
            >
              ✕
            </button>
          </div>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={form.formState.isSubmitting}
          className="button col-span-2 m-auto w-full md:!text-xl dark:text-white"
        >
          {form.formState.isSubmitting ? "Submitting..." : `${type} Event `}
        </Button>
      </form>
    </Form>
  );
};

export default EventForm;
