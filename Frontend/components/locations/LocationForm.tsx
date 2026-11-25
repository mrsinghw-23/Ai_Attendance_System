"use client";

import { useEffect, useState } from "react";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import {
  createLocationSchema,
  CreateLocationInput,
} from "@/schemas/location.schema";
import { Location } from "@/types/location";

interface LocationFormProps {
  initialData?: Location | null;
  loading?: boolean;
  onSubmit: (
    data: CreateLocationInput
  ) => Promise<void>;
  onCancel: () => void;
}

export default function LocationForm({
  initialData,
  loading = false,
  onSubmit,
  onCancel,
}: LocationFormProps) {
  const [values, setValues] =
    useState<CreateLocationInput>({
      location_name: "",
      city: "",
      state: "",
    });
  const [errors, setErrors] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (initialData) {
      setValues({
        location_name:
          initialData.location_name,
        city: initialData.city || "",
        state: initialData.state || "",
      });
    }
  }, [initialData]);

  function updateField(
    key: keyof CreateLocationInput,
    value: string
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();
    setErrors({});

    const parsed =
      createLocationSchema.safeParse(values);

    if (!parsed.success) {
      const fieldErrors: Record<
        string,
        string
      > = {};
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0];
        if (typeof field === "string") {
          fieldErrors[field] = issue.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    await onSubmit(parsed.data);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <Input
        label="Location Name"
        placeholder="Head Office"
        value={values.location_name}
        error={errors.location_name}
        onChange={(e) =>
          updateField(
            "location_name",
            e.target.value
          )
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="City"
          placeholder="Ranchi"
          value={values.city}
          error={errors.city}
          onChange={(e) =>
            updateField("city", e.target.value)
          }
        />
        <Input
          label="State"
          placeholder="Jharkhand"
          value={values.state}
          error={errors.state}
          onChange={(e) =>
            updateField(
              "state",
              e.target.value
            )
          }
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading
            ? "Saving..."
            : initialData
              ? "Update Location"
              : "Create Location"}
        </Button>
      </div>
    </form>
  );
}
