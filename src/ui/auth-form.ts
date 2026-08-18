import type { FormEvent } from "react";
import type { FieldValues, UseFormHandleSubmit } from "react-hook-form";

/** Prevent native GET/POST navigation; password managers often bypass RHF without this. */
export function bindFormSubmit<T extends FieldValues>(
  handleSubmit: UseFormHandleSubmit<T>,
  onValid: (values: T) => void | Promise<void>,
) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleSubmit(onValid)(event);
  };
}
