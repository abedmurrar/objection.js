import { difference } from '../utils/objectUtils';
import type { ModelClass, ModelJson } from './Model';

function columnNameToPropertyName(modelClass: ModelClass, columnName: string): string {
  const model = new modelClass();
  const addedProps = Object.keys(model.$parseDatabaseJson({}));

  const row: ModelJson = {};
  row[columnName] = null;

  const props = Object.keys(model.$parseDatabaseJson(row));
  const propertyName: string | undefined = difference(props, addedProps)[0];

  return propertyName || columnName;
}

function propertyNameToColumnName(modelClass: ModelClass, propertyName: string): string {
  const model = new modelClass();
  const addedCols = Object.keys(model.$formatDatabaseJson({}));

  const obj: ModelJson = {};
  obj[propertyName] = null;

  const cols = Object.keys(model.$formatDatabaseJson(obj));
  const columnName: string | undefined = difference(cols, addedCols)[0];

  return columnName || propertyName;
}

export { columnNameToPropertyName, propertyNameToColumnName };
