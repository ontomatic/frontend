import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext } from "react-router";

import Badge from "~/components/badge";
import Button from "~/components/button";
import Empty from "~/components/empty";
import Field from "~/components/field";
import Modal from "~/components/modal";
import Notice from "~/components/notice";
import PageTitle from "~/components/page-title";
import Panel from "~/components/panel";
import Table from "~/components/table";
import apiClient from "~/lib/api/client";
import type { CurrentUser } from "~/lib/api/workspace";

const AdminPage = () => {
  const user = useOutletContext<CurrentUser>();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<CurrentUser | "new" | null>(null);
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ["admin", "users", search],
    enabled: user.role === "system_admin",
    queryFn: async () =>
      (
        await apiClient.get<{ items: (CurrentUser & { is_active: boolean })[] }>("/api/v1/admin/users", {
          params: { q: search, page_size: 100 },
        })
      ).data,
  });
  const departments = useQuery({
    queryKey: ["admin", "departments"],
    enabled: user.role === "system_admin",
    queryFn: async () => (await apiClient.get<{ id: number; name: string }[]>("/api/v1/admin/departments")).data,
  });
  const action = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      editing === "new"
        ? apiClient.post("/api/v1/admin/users", body)
        : apiClient.patch(`/api/v1/admin/users/${(editing as CurrentUser).id}`, body),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
  if (user.role !== "system_admin")
    return <Notice tone="error">계정 관리는 시스템 관리자만 사용할 수 있습니다.</Notice>;
  return (
    <>
      <PageTitle title="계정·부서 관리" description="사용자의 이름과 담당 부서를 관리합니다.">
        <Button
          variant="primary"
          onClick={() => {
            setEditing("new");
            action.reset();
          }}
        >
          ＋ 계정 생성
        </Button>
      </PageTitle>
      <Panel>
        <Field label="사번·이름 검색" className="mb-5 max-w-md">
          <input value={search} onChange={(event) => setSearch(event.target.value)} />
        </Field>
        {users.error || departments.error ? (
          <Notice error={users.error || departments.error} />
        ) : users.isPending ? (
          <p role="status">계정을 불러오는 중…</p>
        ) : users.data?.items.length ? (
          <Table headings={["사번", "이름", "부서", "상태", ""]}>
            {users.data.items.map((account) => (
              <tr key={account.id}>
                <td>{account.emp_id}</td>
                <td>{account.name}</td>
                <td>{account.department?.name ?? "부서 없음"}</td>
                <td>
                  <Badge status={account.is_active ? "passed" : "held"}>{account.is_active ? "활성" : "비활성"}</Badge>
                </td>
                <td>
                  <Button
                    onClick={() => {
                      setEditing(account);
                      action.reset();
                    }}
                  >
                    수정
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty title="일치하는 계정이 없습니다" />
        )}
      </Panel>
      {editing && (
        <Modal title={editing === "new" ? "일반 사용자 계정 생성" : "이름·부서 수정"} onClose={() => setEditing(null)}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              action.mutate({
                name: data.get("name"),
                department_id: Number(data.get("department_id")),
                ...(editing === "new" ? { emp_id: data.get("emp_id"), password: data.get("password") } : {}),
              });
            }}
          >
            {editing === "new" && (
              <>
                <Field label="사번">
                  <input name="emp_id" autoComplete="off" required maxLength={30} />
                </Field>
                <Field label="초기 비밀번호 (12~30자)">
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={30}
                  />
                </Field>
              </>
            )}
            <Field label="이름">
              <input name="name" required maxLength={100} defaultValue={editing === "new" ? "" : editing.name} />
            </Field>
            <Field label="담당 부서">
              <select name="department_id" required defaultValue={editing === "new" ? "" : editing.department?.id}>
                <option value="">부서 선택</option>
                {departments.data?.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
            {action.error && <Notice error={action.error} />}
            <Button type="submit" variant="primary" disabled={action.isPending}>
              저장
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
};
export default AdminPage;

export const meta = () => [{ title: "계정·부서 관리 · Ontomatic" }];
