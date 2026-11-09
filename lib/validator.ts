import * as z from 'zod';

export const eventFormSchema = z.object({
	title: z.string().min(3, 'Title must be at least 3 characters'),
	description: z
		.string()
		.min(3, 'Description must be at least 3 characters')
		.max(400, 'Description must be less than 400 characters'),
	location: z
		.string()
		.min(3, 'Location must be at least 3 characters')
		.max(400, 'Location must be less than 400 characters'),
	imageUrl: z.string().min(1, 'Please upload an event image'),
	startDateTime: z.date({ message: 'Please select a valid start date and time' }),
	endDateTime: z.date({ message: 'Please select a valid end date and time' }),
	categoryId: z.string().min(1, 'Please select a category'),
	price: z.string(),
	isFree: z.boolean(),
	url: z.string().url('Please enter a valid URL (e.g. https://example.com)').or(z.literal('')),
});

export type EventFormValues = z.infer<typeof eventFormSchema>;
