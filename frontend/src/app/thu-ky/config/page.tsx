"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { PageShell } from "@/components/PageShell";
import { Card } from "@/components/ui";
import { AddLineForm } from "@/components/AddLineForm";
import { LineConfigRow } from "@/components/LineConfigRow";
import { UserManagement } from "@/components/UserManagement";
import { api } from "@/lib/api";
import type { Line, User } from "@/lib/types";

function ConfigContent() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [users, setUsers] = useState<User[] | null>(null);

  const load = useCallback(() => {
    api.listLines(true).then(setLines);
    api.listUsers().then(setUsers);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toTruongs = users?.filter((u) => u.role === "to_truong" && u.is_active) ?? [];
  const executiveNames = [...new Set((lines ?? []).map((l) => l.executive_name))].sort();

  return (
    <PageShell title="Cấu hình Line & tài khoản" description="Quản lý danh sách line, target, và phân công Tổ trưởng phụ trách">
      <div className="flex flex-col gap-6">
        {users ? <UserManagement users={users} executiveNames={executiveNames} onChanged={load} /> : null}

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">Thêm Line mới</h2>
          <AddLineForm toTruongs={toTruongs} executiveNames={executiveNames} onCreated={load} />
        </Card>

        <Card className="overflow-hidden">
          <h2 className="px-5 pt-5 text-sm font-semibold text-foreground">Danh sách Line ({lines?.length ?? 0})</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Line</th>
                  <th className="px-3 py-2 font-medium">PU</th>
                  <th className="px-3 py-2 font-medium">Executive</th>
                  <th className="px-3 py-2 font-medium">Tổ trưởng</th>
                  <th className="px-3 py-2 font-medium">Trạng thái</th>
                  <th className="px-3 py-2 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {lines?.map((line) => (
                  <LineConfigRow key={line.id} line={line} toTruongs={toTruongs} onChanged={load} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

export default function ConfigPage() {
  return (
    <RequireRole roles={["thu_ky", "sep"]}>
      <ConfigContent />
    </RequireRole>
  );
}
