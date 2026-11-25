"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import {
  createEmployeeSchema,
  CreateEmployeeInput,
} from "@/schemas/employee.schema";
import { Location } from "@/types/location";
import { Employee } from "@/types/employee";

interface ManagerOption {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
}

interface EmployeeFormProps {
  initialData?: Employee | null;
  locations: Location[];
  managers: ManagerOption[];
  loading?: boolean;
  onSubmit: (
    data: CreateEmployeeInput
  ) => Promise<void>;
  onCancel?: () => void;
}

export default function EmployeeForm({
  initialData,
  locations,
  managers,
  loading = false,
  onSubmit,
  onCancel,
}: EmployeeFormProps) {
  const [formError, setFormError] =
    useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CreateEmployeeInput>({
    defaultValues: {
      employee_code: "",
      first_name: "",
      last_name: "",
      email: "",
      mobile: "",
      designation: "",
      department: "",
      location_id: null,
      reporting_manager_id: null,
      status: "ACTIVE",
      joining_date: "",
      photo_url: "",
      face_registration_status:
        "NOT_REGISTERED",
    },
  });

  const selectedLocationId = watch(
    "location_id"
  );

  useEffect(() => {
    if (!initialData) {
      return;
    }

    reset({
      employee_code:
        initialData.employee_code,
      first_name: initialData.first_name,
      last_name: initialData.last_name,
      email: initialData.email || "",
      mobile: initialData.mobile || "",
      designation:
        initialData.designation || "",
      department:
        initialData.department || "",
      location_id:
        initialData.location_id,
      reporting_manager_id:
        initialData.reporting_manager_id,
      status: initialData.status,
      joining_date:
        initialData.joining_date || "",
      photo_url:
        initialData.photo_url || "",
      face_registration_status:
        initialData.face_registration_status,
    });
  }, [initialData, reset]);

  useEffect(() => {
    if (!selectedLocationId) {
      return;
    }

    async function loadManagers() {
      const response = await fetch(
        `/api/employees/managers?location_id=${selectedLocationId}`
      );
      const data = await response.json();

      if (data.success) {
        const currentManagerId = watch(
          "reporting_manager_id"
        );
        const exists = data.data.some(
          (manager: ManagerOption) =>
            manager.id === currentManagerId
        );

        if (!exists) {
          setValue(
            "reporting_manager_id",
            null
          );
        }
      }
    }

    loadManagers();
  }, [selectedLocationId, setValue, watch]);

  async function submitForm(
    values: CreateEmployeeInput
  ) {
    setFormError(null);

    const parsed =
      createEmployeeSchema.safeParse(values);

    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0];

        if (
          typeof field === "string"
        ) {
          setError(
            field as keyof CreateEmployeeInput,
            { message: issue.message }
          );
        }
      });

      setFormError("Please fix the highlighted fields.");
      return;
    }

    await onSubmit(parsed.data);
  }

  return (
    <form
      onSubmit={handleSubmit(submitForm)}
      className="space-y-6"
    >
      {formError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Employee Code"
          placeholder="EMP001"
          error={
            errors.employee_code?.message
          }
          {...register("employee_code")}
        />
        <Select
          label="Status"
          error={errors.status?.message}
          options={[
            {
              label: "Active",
              value: "ACTIVE",
            },
            {
              label: "Inactive",
              value: "INACTIVE",
            },
            {
              label: "On Leave",
              value: "ON_LEAVE",
            },
          ]}
          {...register("status")}
        />
        <Input
          label="First Name"
          placeholder="Rahul"
          error={errors.first_name?.message}
          {...register("first_name")}
        />
        <Input
          label="Last Name"
          placeholder="Kumar"
          error={errors.last_name?.message}
          {...register("last_name")}
        />
        <Input
          label="Email"
          type="email"
          placeholder="rahul@company.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Mobile"
          placeholder="+91 9876543210"
          error={errors.mobile?.message}
          {...register("mobile")}
        />
        <Input
          label="Designation"
          placeholder="HR Manager"
          error={errors.designation?.message}
          {...register("designation")}
        />
        <Input
          label="Department"
          placeholder="Human Resources"
          error={errors.department?.message}
          {...register("department")}
        />
        <Select
          label="Location"
          error={errors.location_id?.message}
          options={[
            {
              label: "Select location",
              value: "",
            },
            ...locations.map((location) => ({
              label: location.location_name,
              value: location.id,
            })),
          ]}
          {...register("location_id", {
            setValueAs: (value) =>
              value === "" || value === null
                ? null
                : Number(value),
          })}
        />
        <Select
          label="Reporting Manager"
          error={
            errors.reporting_manager_id
              ?.message
          }
          options={[
            {
              label: "Select manager",
              value: "",
            },
            ...managers.map((manager) => ({
              label: `${manager.first_name} ${manager.last_name} (${manager.employee_code})`,
              value: manager.id,
            })),
          ]}
          {...register(
            "reporting_manager_id",
            {
              setValueAs: (value) =>
                value === "" || value === null
                  ? null
                  : Number(value),
            }
          )}
        />
        <Input
          label="Joining Date"
          type="date"
          error={
            errors.joining_date?.message
          }
          {...register("joining_date")}
        />
        <Input
          label="Photo URL"
          placeholder="https://..."
          error={errors.photo_url?.message}
          {...register("photo_url")}
        />
        <Select
          label="Face Registration Status"
          error={
            errors.face_registration_status
              ?.message
          }
          options={[
            {
              label: "Not Registered",
              value: "NOT_REGISTERED",
            },
            {
              label: "Pending",
              value: "PENDING",
            },
            {
              label: "Registered",
              value: "REGISTERED",
            },
          ]}
          {...register(
            "face_registration_status"
          )}
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={loading}
        >
          {loading
            ? "Saving..."
            : initialData
              ? "Update Employee"
              : "Create Employee"}
        </Button>
      </div>
    </form>
  );
}
