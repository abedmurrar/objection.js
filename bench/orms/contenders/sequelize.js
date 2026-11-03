'use strict';

const { Sequelize, DataTypes, Op } = require('sequelize');
const { connection, personRow, nestedPerson, hundredRows, idCycler } = require('../common');

async function create() {
  const sequelize = new Sequelize(connection.database, connection.user, connection.password, {
    host: connection.host,
    port: connection.port,
    dialect: 'mysql',
    logging: false,
    pool: { min: 1, max: 4 },
  });

  const opts = { timestamps: false, freezeTableName: true };
  const Person = sequelize.define(
    'person',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      firstName: DataTypes.STRING,
      lastName: DataTypes.STRING,
      age: DataTypes.INTEGER,
    },
    opts,
  );
  const Pet = sequelize.define(
    'pet',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      ownerId: DataTypes.INTEGER,
      name: DataTypes.STRING,
      species: DataTypes.STRING,
    },
    opts,
  );
  const Toy = sequelize.define(
    'toy',
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      petId: DataTypes.INTEGER,
      name: DataTypes.STRING,
      price: DataTypes.INTEGER,
    },
    opts,
  );

  Person.hasMany(Pet, { foreignKey: 'ownerId', as: 'pets' });
  Pet.hasMany(Toy, { foreignKey: 'petId', as: 'toys' });

  const nextId = idCycler();
  let n = 0;

  const scenarios = {
    'find by id': () => Person.findByPk(nextId()),
    'find 100 rows (where, order, limit)': () =>
      Person.findAll({ where: { age: { [Op.gt]: 30 } }, order: [['id', 'ASC']], limit: 100 }),
    'find 1000 rows': () => Person.findAll(),
    'insert 1 row': () => Person.create(personRow(++n)),
    'batch insert 100 rows': () => Person.bulkCreate(hundredRows(++n)),
    'update by id': () => Person.update({ age: 20 + (++n % 50) }, { where: { id: nextId() } }),
    'delete by id (missing row)': () => Person.destroy({ where: { id: 0 } }),
    'eager: 100 persons > pets > toys (separate queries)': () =>
      Person.findAll({
        where: { id: { [Op.lte]: 100 } },
        include: [
          {
            model: Pet,
            as: 'pets',
            separate: true,
            include: [{ model: Toy, as: 'toys', separate: true }],
          },
        ],
      }),
    'eager: 100 persons > pets > toys (one query)': () =>
      Person.findAll({
        where: { id: { [Op.lte]: 100 } },
        include: [{ model: Pet, as: 'pets', include: [{ model: Toy, as: 'toys' }] }],
      }),
    'transaction: insert + update': () =>
      sequelize.transaction(async (transaction) => {
        const person = await Person.create(personRow(++n), { transaction });
        await person.update({ age: 99 }, { transaction });
      }),
    'nested insert: person + 2 pets + 4 toys': () =>
      sequelize.transaction((transaction) =>
        Person.create(nestedPerson(++n), {
          transaction,
          include: [{ model: Pet, as: 'pets', include: [{ model: Toy, as: 'toys' }] }],
        }),
      ),
  };

  return { scenarios, close: () => sequelize.close() };
}

module.exports = { create };
