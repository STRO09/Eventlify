import EventForm from "@/components/shared/EventForm";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const CreateEvent = async () => {
  const { userId: clerkId } = await auth();

  if (!clerkId) redirect("/sign-in");

  const client = await clerkClient();
  const clerkUser = await client.users.getUser(clerkId);

  const userId = clerkUser.publicMetadata.userId as string | undefined;

  if (!userId) {
    throw new Error("MongoDB user ID missing from Clerk metadata.");
  }

  return (
    <>
      <section className="bg-primary-50 dark:bg-inherit bg-dotted-pattern bg-cover bg-center py-5 md:py-10 px-0 xl:px-6">
        <h3 className="wrapper h3-bold text-center sm:text-left">
          Create Event
        </h3>
      </section>

      <section className="my-8 px-0 xl:px-6">
        <div className="wrapper">
          <EventForm userId={userId} type="Create" />
        </div>
      </section>
    </>
  );
};

export default CreateEvent;
