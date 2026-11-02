const OWNER_JOIN_COLUMN_ALIAS_PREFIX = 'objectiontmpjoin';

function getTempColumn(index: number): string {
  return `${OWNER_JOIN_COLUMN_ALIAS_PREFIX}${index}`;
}

export { getTempColumn };
