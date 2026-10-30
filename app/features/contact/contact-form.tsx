import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const contactSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  message: z.string().trim().min(10, "Message must be at least 10 characters."),
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
});

type ContactFormValues = z.infer<typeof contactSchema>;

const defaultValues: ContactFormValues = {
  email: "",
  message: "",
  name: "",
};

export function ContactForm() {
  const [lastSubmission, setLastSubmission] = useState<ContactFormValues | null>(null);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<ContactFormValues>({
    defaultValues,
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = handleSubmit((values) => {
    setLastSubmission(values);
    reset(defaultValues);
  });

  return (
    <form className="contact-form" onSubmit={onSubmit}>
      <label>
        <span>Name</span>
        <input autoComplete="name" placeholder="Ada Lovelace" {...register("name")} />
        {errors.name ? <small>{errors.name.message}</small> : null}
      </label>

      <label>
        <span>Email</span>
        <input autoComplete="email" placeholder="ada@example.com" type="email" {...register("email")} />
        {errors.email ? <small>{errors.email.message}</small> : null}
      </label>

      <label>
        <span>Message</span>
        <textarea placeholder="What should this starter help you ship?" rows={4} {...register("message")} />
        {errors.message ? <small>{errors.message.message}</small> : null}
      </label>

      <button disabled={isSubmitting} type="submit">
        Save draft
      </button>

      {lastSubmission ? (
        <p className="form-note">
          Draft saved for {lastSubmission.name} at {lastSubmission.email}.
        </p>
      ) : null}
    </form>
  );
}
