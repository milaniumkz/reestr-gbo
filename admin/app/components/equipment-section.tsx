import { FormEvent } from 'react';
import { EquipmentItem } from '@/lib/api';
import { statusLabel } from '../lib/labels';
import { EmptyTableRow } from './ui-primitives';

type Props = {
  items: EquipmentItem[];
  type: EquipmentItem['type'];
  name: string;
  onType: (value: EquipmentItem['type']) => void;
  onName: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (item: EquipmentItem) => void;
  onToggle: (item: EquipmentItem) => void;
  onDelete: (item: EquipmentItem) => void;
};

export function EquipmentSection({
  items,
  type,
  name,
  onType,
  onName,
  onSubmit,
  onEdit,
  onToggle,
  onDelete,
}: Props) {
  return (
    <>
      <form className="wideForm" onSubmit={onSubmit}>
        <select value={type} onChange={(event) => onType(event.target.value as EquipmentItem['type'])}>
          <option value="reducer">Редуктор</option>
          <option value="control_unit">ЭБУ</option>
          <option value="cylinder_manufacturer">Производитель баллона</option>
        </select>
        <input
          placeholder="Название оборудования"
          value={name}
          onChange={(event) => onName(event.target.value)}
        />
        <button type="submit">Добавить</button>
      </form>
      <section className="table">
        <table>
          <thead>
            <tr>
              <th>Тип</th>
              <th>Название</th>
              <th>Статус</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {!items.length && <EmptyTableRow colSpan={4} />}
            {items.map((item) => (
              <tr key={item.id}>
                <td>{equipmentTypeLabel(item.type)}</td>
                <td>{item.name}</td>
                <td><span className="pill">{statusLabel(item.isActive ? 'active' : 'hidden')}</span></td>
                <td>
                  <div className="actions">
                    <button className="smallButton" type="button" onClick={() => onEdit(item)}>
                      Редактировать
                    </button>
                    <button className="smallButton" type="button" onClick={() => onToggle(item)}>
                      {item.isActive ? 'Скрыть' : 'Показать'}
                    </button>
                    <button className="smallButton dangerButton" type="button" onClick={() => onDelete(item)}>
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function equipmentTypeLabel(type: EquipmentItem['type']) {
  if (type === 'reducer') return 'Редуктор';
  if (type === 'control_unit') return 'ЭБУ';
  return 'Производитель баллона';
}
