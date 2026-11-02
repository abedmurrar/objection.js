function inherit<C extends Function>(Constructor: C, BaseConstructor: Function): C {
  Constructor.prototype = Object.create(BaseConstructor.prototype);
  Constructor.prototype.constructor = BaseConstructor;
  Object.setPrototypeOf(Constructor, BaseConstructor);

  return Constructor;
}

export { inherit };
