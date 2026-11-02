import { CompositeQueryTransformation } from './CompositeQueryTransformation';

import { WrapMysqlModifySubqueryTransformation } from './WrapMysqlModifySubqueryTransformation';

const transformation = new CompositeQueryTransformation([
  new WrapMysqlModifySubqueryTransformation(),
]);

export { transformation };
