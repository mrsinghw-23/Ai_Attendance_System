"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import EmployeeForm from "@/components/employees/EmployeeForm";
import { useToast } from "@/providers/ToastProvider";
import { CreateEmployeeInput } from "@/schemas/employee.schema";
import { Location } from "@/types/location";

interface ManagerOption {
  id: number;
  employee_code: string;
  first_name: string;
  last_name: string;
}

export default function NewEmployeePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [locations, setLocations] = useState<
    Location[]
  >([]);
  const [managers, setManagers] = useState<
    ManagerOption[]
  >([]);
  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    async function loadFormData() {
      const [locationsResponse, managersResponse] =
        await Promise.all([
          fetch("/api/locations"),
          fetch("/api/employees/managers"),
        ]);

      const locationsData =
        await locationsResponse.json();
      const managersData =
        await managersResponse.json();

      if (locationsData.success) {
        setLocations(locationsData.data);
      }

      if (managersData.success) {
        setManagers(managersData.data);
      }
    }

    loadFormData();
  }, []);

  async function handleSubmit(
    data: CreateEmployeeInput
  ) {
    setLoading(true);

    const response = await fetch(
      "/api/employees",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    const result = await response.json();

    if (result.success) {
      showToast(
        "Employee created successfully",
        "success"
      );
      router.push(
        `/employees/${result.data.id}?tab=face&live=1`
      );
    } else {
      showToast(
        result.message ||
          "Failed to create employee",
        "error"
      );
    }

    setLoading(false);
  }

  return (
    <DashboardLayout
      title="Add Employee"
      module="employees"
    >
      <div className="max-w-5xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-6">
        <EmployeeForm
          locations={locations}
          managers={managers}
          loading={loading}
          onSubmit={handleSubmit}
          onCancel={() =>
            router.push("/employees")
          }
        />
      </div>
    </DashboardLayout>
  );
}
