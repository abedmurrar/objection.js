'use strict';

const OWNER_JOIN_COLUMN_ALIAS_PREFIX = 'objectiontmpjoin';

function getTempColumn(index) {
  return `${OWNER_JOIN_COLUMN_ALIAS_PREFIX}${index}`;
}

module.exports = {
  getTempColumn,
};
