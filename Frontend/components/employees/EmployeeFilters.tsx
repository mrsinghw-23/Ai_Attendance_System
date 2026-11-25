"use client";

import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Location } from "@/types/location";
import { EmployeeStatus } from "@/types/employee";

export interface EmployeeFilterValues {
  search: string;
  status: EmployeeStatus | "";
  department: string;
  location_id: string;
}

interface EmployeeFiltersProps {
  filters: EmployeeFilterValues;
  locations: Location[];
  onChange: (
    filters: EmployeeFilterValues
  ) => void;
}

export default function EmployeeFilters({
  filters,
  locations,
  onChange,
}: EmployeeFiltersProps) {
  function updateField<
    K extends keyof EmployeeFilterValues,
  >(
    key: K,
    value: EmployeeFilterValues[K]
  ) {
    onChange({
      ...filters,
      [key]: value,
    });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      <Input
        label="Search"
        placeholder="Name, code, email, department..."
        value={filters.search}
        onChange={(event) =>
          updateField(
            "search",
            event.target.value
          )
        }
      />

      <Select
        label="Status"
        value={filters.status}
        onChange={(event) =>
          updateField(
            "status",
            event.target
              .value as EmployeeFilterValues["status"]
          )
        }
        options={[
          { label: "All Statuses", value: "" },
          { label: "Active", value: "ACTIVE" },
          {
            label: "Inactive",
            value: "INACTIVE",
          },
          {
            label: "On Leave",
            value: "ON_LEAVE",
          },
        ]}
      />

      <Input
        label="Department"
        placeholder="Filter by department"
        value={filters.department}
        onChange={(event) =>
          updateField(
            "department",
            event.target.value
          )
        }
      />

      <Select
        label="Location"
        value={filters.location_id}
        onChange={(event) =>
          updateField(
            "location_id",
            event.target.value
          )
        }
        options={[
          { label: "All Locations", value: "" },
          ...locations.map((location) => ({
            label: location.location_name,
            value: location.id,
          })),
        ]}
      />
    </div>
  );
}
