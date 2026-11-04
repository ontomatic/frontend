import { useState } from "react";

import Button from "~/components/button";
import Check from "~/components/check";
import EvidenceFields from "~/components/evidence-fields";
import Field from "~/components/field";
import Modal from "~/components/modal";
import Notice from "~/components/notice";
import Table from "~/components/table";
import { kindNames } from "~/lib/api/workspace";
import type { Attribute, Graph, Item, Relation, WorkDocument } from "~/lib/api/workspace";

interface GraphEditorProps {
  graph: Graph;
  onChange: (graph: Graph) => void;
  documents: WorkDocument[];
  disabled: boolean;
}
const GraphEditor = ({ graph, onChange, documents, disabled }: GraphEditorProps) => {
  const [selectedKey, setSelectedKey] = useState(graph.root);
  const [tab, setTab] = useState("attributes");
  const [adding, setAdding] = useState(false);
  const selected = graph.items.find((item) => item.key === selectedKey) ?? graph.items[0];
  const updateItem = (change: Partial<Item>) =>
    onChange({
      ...graph,
      items: graph.items.map((item) => (item.key === selected.key ? { ...item, ...change } : item)),
    });
  const updateAttribute = (index: number, change: Partial<Attribute>) =>
    updateItem({
      attributes: selected.attributes.map((attribute, i) => (i === index ? { ...attribute, ...change } : attribute)),
    });
  const updateRelation = (index: number, change: Partial<Relation>) =>
    onChange({
      ...graph,
      relations: graph.relations.map((relation, i) => (i === index ? { ...relation, ...change } : relation)),
    });
  const changeVersion = (version: number) => {
    const key = `${selected.code}@${version}`;
    if (graph.items.some((item) => item.key === key && item.key !== selected.key)) return;
    onChange({
      ...graph,
      root: graph.root === selected.key ? key : graph.root,
      items: graph.items.map((item) =>
        item.key === selected.key ? { ...item, version, key, confirmed: false } : item,
      ),
      relations: graph.relations.map((relation) => ({
        ...relation,
        parent: relation.parent === selected.key ? key : relation.parent,
        child: relation.child === selected.key ? key : relation.child,
      })),
    });
    setSelectedKey(key);
  };
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="확인할 품목·버전" className="min-w-60 flex-1">
          <select value={selected.key} onChange={(event) => setSelectedKey(event.target.value)}>
            {graph.items.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name} · {item.code || "코드 미확인"} v{item.version}
              </option>
            ))}
          </select>
        </Field>
        {!disabled && <Button onClick={() => setAdding(true)}>＋ 품목·다른 버전 추가</Button>}
      </div>
      <fieldset disabled={disabled} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="공통 품목코드">
            <input
              value={selected.code}
              maxLength={80}
              onChange={(event) => updateItem({ code: event.target.value, confirmed: false })}
            />
          </Field>
          <Field label="표준 명칭">
            <input
              value={selected.name}
              onChange={(event) => updateItem({ name: event.target.value, confirmed: false })}
            />
          </Field>
          <Field label="품목 종류">
            <select
              value={selected.kind}
              onChange={(event) => updateItem({ kind: event.target.value as Item["kind"], confirmed: false })}
            >
              {Object.entries(kindNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="품목 사양 버전">
            <input
              type="number"
              min={1}
              value={selected.version}
              onChange={(event) => changeVersion(Number(event.target.value))}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <Field label="부서별 별칭 (쉼표 구분)">
            <input
              value={selected.aliases.join(", ")}
              onChange={(event) =>
                updateItem({
                  aliases: event.target.value
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
          <Field label="수량 단위">
            <input value={selected.unit} onChange={(event) => updateItem({ unit: event.target.value })} />
          </Field>
        </div>
        <Check checked={selected.confirmed} onChange={(confirmed) => updateItem({ confirmed })}>
          품목코드·종류·사양 버전·별칭을 원문과 대조했습니다.
        </Check>
      </fieldset>
      <div className="border-line flex gap-4 border-b" role="tablist" aria-label="R&D 확인 항목">
        {[
          ["attributes", "사양 확인"],
          ["relations", "구성 관계 확인"],
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`border-b-2 px-1 py-3 text-sm ${tab === value ? "text-accent border-orange-400" : "text-muted border-transparent"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "attributes" ? (
        <div className="grid gap-4">
          {!selected.attributes.length && (
            <Notice>
              제품사양서의 필수 사양을 추가하거나 추출 후보를 불러오세요. 원문에 없는 값을 추정하지 않습니다.
            </Notice>
          )}
          {selected.attributes.map((attribute, index) => (
            <section key={index} className="border-line grid gap-4 rounded-lg border p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="공통 사양 항목">
                  <input
                    disabled={disabled}
                    list="common-fields"
                    value={attribute.field}
                    onChange={(event) => updateAttribute(index, { field: event.target.value, confirmed: false })}
                  />
                </Field>
                <Field label="확인할 값">
                  <input
                    disabled={disabled}
                    value={attribute.value}
                    onChange={(event) => updateAttribute(index, { value: event.target.value, confirmed: false })}
                  />
                </Field>
                <Field label="값의 단위">
                  <input
                    disabled={disabled}
                    list="units"
                    value={attribute.unit}
                    onChange={(event) => updateAttribute(index, { unit: event.target.value, confirmed: false })}
                  />
                </Field>
              </div>
              <EvidenceFields
                value={attribute.source}
                documents={documents}
                disabled={disabled}
                original
                onChange={(source) => updateAttribute(index, { source, confirmed: false })}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Check
                  disabled={disabled}
                  checked={attribute.confirmed}
                  onChange={(confirmed) => updateAttribute(index, { confirmed })}
                >
                  항목 매핑·값·단위·원문 페이지를 확인했습니다.
                </Check>
                {!disabled && (
                  <Button
                    variant="ghost"
                    onClick={() => updateItem({ attributes: selected.attributes.filter((_, i) => i !== index) })}
                  >
                    사양 삭제
                  </Button>
                )}
              </div>
            </section>
          ))}
          {!disabled && (
            <Button
              className="justify-self-start"
              onClick={() =>
                updateItem({
                  attributes: [
                    ...selected.attributes,
                    { field: "", value: "", unit: "", required: true, confirmed: false, source: null },
                  ],
                })
              }
            >
              ＋ 사양 항목 추가
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4">
          <Table headings={["상위 → 하위", "수량", "사용 조건"]}>
            {graph.relations
              .filter((relation) => relation.parent === selected.key)
              .map((relation, i) => (
                <tr key={i}>
                  <td>
                    {relation.parent} → {relation.child}
                  </td>
                  <td>{relation.quantity}</td>
                  <td>{relation.condition}</td>
                </tr>
              ))}
          </Table>
          {graph.relations.map((relation, index) =>
            relation.parent !== selected.key ? null : (
              <section key={index} className="border-line grid gap-4 rounded-lg border p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_7rem_1fr]">
                  <Field label="직접 하위 품목·버전">
                    <select
                      disabled={disabled}
                      value={relation.child}
                      onChange={(event) => updateRelation(index, { child: event.target.value, confirmed: false })}
                    >
                      {graph.items
                        .filter((item) => item.key !== selected.key)
                        .map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.name} · {item.key}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="소요 수량">
                    <input
                      type="number"
                      step="any"
                      min="0.000001"
                      disabled={disabled}
                      value={relation.quantity || ""}
                      onChange={(event) =>
                        updateRelation(index, { quantity: Number(event.target.value), confirmed: false })
                      }
                    />
                  </Field>
                  <Field label="사용 조건">
                    <input
                      disabled={disabled}
                      value={relation.condition}
                      placeholder="원문에 명시된 조건"
                      onChange={(event) => updateRelation(index, { condition: event.target.value, confirmed: false })}
                    />
                  </Field>
                </div>
                <EvidenceFields
                  value={relation.source}
                  documents={documents}
                  disabled={disabled}
                  original
                  onChange={(source) => updateRelation(index, { source, confirmed: false })}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Check
                    disabled={disabled}
                    checked={relation.confirmed}
                    onChange={(confirmed) => updateRelation(index, { confirmed })}
                  >
                    하위 버전·수량·사용 조건·근거를 확인했습니다.
                  </Check>
                  {!disabled && (
                    <Button
                      variant="ghost"
                      onClick={() => onChange({ ...graph, relations: graph.relations.filter((_, i) => i !== index) })}
                    >
                      관계 삭제
                    </Button>
                  )}
                </div>
              </section>
            ),
          )}
          {!disabled && (
            <Button
              disabled={graph.items.length < 2 || selected.kind === "material"}
              className="justify-self-start"
              onClick={() =>
                onChange({
                  ...graph,
                  relations: [
                    ...graph.relations,
                    {
                      parent: selected.key,
                      child: graph.items.find((item) => item.key !== selected.key)!.key,
                      quantity: 0,
                      condition: "",
                      confirmed: false,
                      source: null,
                    },
                  ],
                })
              }
            >
              ＋ 하위 구성 연결
            </Button>
          )}
          <p className="text-muted text-xs leading-6">
            같은 품목의 다른 버전을 추가하고 필요한 상위 관계에서만 선택하면 선택적 변경을 만들 수 있습니다. 변경된 상위
            사양도 새 버전으로 확인하세요.
          </p>
        </div>
      )}
      {!disabled && selected.key !== graph.root && (
        <Button
          variant="danger"
          className="justify-self-start"
          onClick={() => {
            onChange({
              ...graph,
              items: graph.items.filter((item) => item.key !== selected.key),
              relations: graph.relations.filter(
                (relation) => relation.parent !== selected.key && relation.child !== selected.key,
              ),
            });
            setSelectedKey(graph.root);
          }}
        >
          이 품목과 연결 관계 삭제
        </Button>
      )}
      <datalist id="common-fields">
        {["length", "diameter", "mass", "voltage", "power", "material", "resolution", "focal_length", "interface"].map(
          (field) => (
            <option key={field} value={field} />
          ),
        )}
      </datalist>
      <datalist id="units">
        {["mm", "cm", "m", "g", "kg", "V", "mV", "W", "mW", "px", "개"].map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
      {adding && (
        <Modal title="품목·사양 버전 추가" onClose={() => setAdding(false)}>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const code = data.get("code") as string;
              const version = Number(data.get("version"));
              const key = `${code}@${version}`;
              if (graph.items.some((item) => item.key === key)) return;
              onChange({
                ...graph,
                items: [
                  ...graph.items,
                  {
                    key,
                    code,
                    name: data.get("name") as string,
                    kind: data.get("kind") as string as Item["kind"],
                    version,
                    unit: data.get("unit") as string,
                    aliases: [],
                    attributes: [],
                    confirmed: false,
                  },
                ],
              });
              setSelectedKey(key);
              setAdding(false);
            }}
          >
            <Field label="품목코드">
              <input name="code" required pattern="[^|]+" maxLength={80} />
            </Field>
            <Field label="표준 명칭">
              <input name="name" required />
            </Field>
            <Field label="품목 종류">
              <select name="kind">
                {Object.entries(kindNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="사양 버전">
              <input name="version" type="number" min={1} required />
            </Field>
            <Field label="수량 단위">
              <input name="unit" required placeholder="원문 단위" />
            </Field>
            <Button type="submit" variant="primary">
              추가
            </Button>
            <p className="text-muted text-xs">이미 있는 코드·버전은 기존 공통 품목을 선택하세요.</p>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default GraphEditor;
