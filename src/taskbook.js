#!/usr/bin/env node
'use strict';
const clipboardy = require('clipboardy');
const Task = require('./task');
const Note = require('./note');
const Storage = require('./storage');
const render = require('./render');

class Taskbook {
  constructor() {
    this._storage = new Storage();
  }

  get _archive() {
    return this._storage.getArchive();
  }

  _data() {
    return this._storage.get();
  }

  _arrayify(x) {
    return Array.isArray(x) ? x : [x];
  }

  async _save(data) {
    await this._storage.set(data);
  }

  _saveArchive(data) {
    this._storage.setArchive(data);
  }

  _removeDuplicates(x) {
    return [...new Set(this._arrayify(x))];
  }

  async _generateID(data) {
    if (!data) {
      data = await this._data();
    }
    const ids = Object.keys(data).map(id => parseInt(id, 10));
    const max = (ids.length === 0) ? 0 : Math.max(...ids);
    return max + 1;
  }

  async _validateIDs(inputIDs, existingIDs) {
    if (!existingIDs) {
      existingIDs = await this._getIDs()
    }

    if (inputIDs.length === 0) {
      render.missingID();
      process.exit(1);
    }

    inputIDs = this._removeDuplicates(inputIDs);

    inputIDs.forEach(id => {
      if (existingIDs.indexOf(Number(id)) === -1) {
        render.invalidID(id);
        process.exit(1);
      }
    });

    return inputIDs;
  }

  _isPriorityOpt(x) {
    return ['p:1', 'p:2', 'p:3'].indexOf(x) > -1;
  }

  async _getBoards() {
    const _data = await this._data();
    const boards = ['My Board'];

    Object.keys(_data).forEach(id => {
      boards.push(..._data[id].boards.filter(x => boards.indexOf(x) === -1));
    });

    return boards;
  }

  async _getDates(data) {
    if (!data) {
      data = await this._data();
    }

    const dates = [];

    Object.keys(data).forEach(id => {
      if (dates.indexOf(data[id]._date) === -1) {
        dates.push(data[id]._date);
      }
    });

    return dates;
  }

  async _getIDs(data) {
    if (!data) {
      data = await this._data();
    }
    return Object.keys(data).map(id => parseInt(id, 10));
  }

  _getPriority(desc) {
    const opt = desc.find(x => this._isPriorityOpt(x));
    return opt ? opt[opt.length - 1] : 1;
  }

  async _getOptions(input) {
    const [boards, desc] = [[], []];

    if (input.length === 0) {
      render.missingDesc();
      process.exit(1);
    }

    const id = await this._generateID();
    const priority = this._getPriority(input);

    input.forEach(x => {
      if (!this._isPriorityOpt(x)) {
        return x.startsWith('@') && x.length > 1 ? boards.push(x) : desc.push(x);
      }
    });

    const description = desc.join(' ');

    if (boards.length === 0) {
      boards.push('My Board');
    }

    return {boards, description, id, priority};
  }

  async _getStats() {
    const _data = await this._data();
    let [complete, inProgress, pending, notes] = [0, 0, 0, 0];

    Object.keys(_data).forEach(id => {
      if (_data[id]._isTask) {
        return _data[id].isComplete ? complete++ : _data[id].inProgress ? inProgress++ : pending++;
      }

      return notes++;
    });

    const total = complete + pending + inProgress;
    const percent = (total === 0) ? 0 : Math.floor(complete * 100 / total);

    return {percent, complete, inProgress, pending, notes};
  }

  _hasTerms(string, terms) {
    for (const term of terms) {
      if (string.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()) > -1) {
        return string;
      }
    }
  }

  _filterTask(data) {
    Object.keys(data).forEach(id => {
      if (!data[id]._isTask) {
        delete data[id];
      }
    });
    return data;
  }

  _filterStarred(data) {
    Object.keys(data).forEach(id => {
      if (!data[id].isStarred) {
        delete data[id];
      }
    });
    return data;
  }

  _filterInProgress(data) {
    Object.keys(data).forEach(id => {
      if (!data[id]._isTask || !data[id].inProgress) {
        delete data[id];
      }
    });
    return data;
  }

  _filterComplete(data) {
    Object.keys(data).forEach(id => {
      if (!data[id]._isTask || !data[id].isComplete) {
        delete data[id];
      }
    });
    return data;
  }

  _filterPending(data) {
    Object.keys(data).forEach(id => {
      if (!data[id]._isTask || data[id].isComplete) {
        delete data[id];
      }
    });
    return data;
  }

  _filterNote(data) {
    Object.keys(data).forEach(id => {
      if (data[id]._isTask) {
        delete data[id];
      }
    });
    return data;
  }

  async _filterByAttributes(attr, data) {
    if (!data) {
      data = await this._data();
    }
    if (Object.keys(data).length === 0) {
      return data;
    }

    attr.forEach(x => {
      switch (x) {
        case 'star':
        case 'starred':
          data = this._filterStarred(data);
          break;

        case 'done':
        case 'checked':
        case 'complete':
          data = this._filterComplete(data);
          break;

        case 'progress':
        case 'started':
        case 'begun':
          data = this._filterInProgress(data);
          break;

        case 'pending':
        case 'unchecked':
        case 'incomplete':
          data = this._filterPending(data);
          break;

        case 'todo':
        case 'task':
        case 'tasks':
          data = this._filterTask(data);
          break;

        case 'note':
        case 'notes':
          data = this._filterNote(data);
          break;

        default:
          break;
      }
    });

    return data;
  }

  async _groupByBoard(data, boards = []) {
    if (!data) {
      data = await this._data();
    }
    const grouped = {};

    if (boards.length === 0) {
      boards = await this._getBoards();
    }

    Object.keys(data).forEach(id => {
      boards.forEach(board => {
        if (data[id].boards.includes(board)) {
          if (Array.isArray(grouped[board])) {
            return grouped[board].push(data[id]);
          }

          grouped[board] = [data[id]];
          return grouped[board];
        }
      });
    });

    return grouped;
  }

  async _groupByDate(data, dates) {
    if (!data) {
      data = await this._data();
    }
    if (!dates) {
     dates = await this._getDates();
    }
    const grouped = {};

    Object.keys(data).forEach(id => {
      dates.forEach(date => {
        if (data[id]._date === date) {
          if (Array.isArray(grouped[date])) {
            return grouped[date].push(data[id]);
          }

          grouped[date] = [data[id]];
          return grouped[date];
        }
      });
    });

    return grouped;
  }

  async _saveItemToArchive(item) {
    const {_archive} = this;
    const archiveID = await this._generateID(_archive);

    item._id = archiveID;
    _archive[archiveID] = item;

    this._saveArchive(_archive);
  }

  async _saveItemToStorage(item) {
    const _data = await this._data();
    const restoreID = await this._generateID();

    item._id = restoreID;
    _data[restoreID] = item;

    this._save(_data);
  }

  async createNote(desc) {
    const {id, description, boards} = await this._getOptions(desc);
    const note = new Note({id, description, boards});
    const _data = await this._data();
    _data[id] = note;
    this._save(_data);
    render.successCreate(note);
  }

  async copyToClipboard(ids) {
    ids = this._validateIDs(ids);
    const _data = await this._data();
    const descriptions = [];

    ids.forEach(id => descriptions.push(_data[id].description));

    clipboardy.writeSync(descriptions.join('\n'));
    render.successCopyToClipboard(ids);
  }

  async checkTasks(ids) {
    ids = await this._validateIDs(ids);
    const _data = await this._data();
    const [checked, unchecked] = [[], []];

    ids.forEach(id => {
      if (_data[id]._isTask) {
        _data[id].inProgress = false;
        _data[id].isComplete = !_data[id].isComplete;
        return _data[id].isComplete ? checked.push(id) : unchecked.push(id);
      }
    });

    this._save(_data);
    render.markComplete(checked);
    render.markIncomplete(unchecked);
  }

  async beginTasks(ids) {
    ids = this._validateIDs(ids);
    const _data = await this._data();
    const [started, paused] = [[], []];

    ids.forEach(id => {
      if (_data[id]._isTask) {
        _data[id].isComplete = false;
        _data[id].inProgress = !_data[id].inProgress;
        return _data[id].inProgress ? started.push(id) : paused.push(id);
      }
    });

    this._save(_data);
    render.markStarted(started);
    render.markPaused(paused);
  }

  async createTask(desc) {
    const {boards, description, id, priority} = await this._getOptions(desc);
    const task = new Task({id, description, boards, priority});
    const _data = await this._data();
    _data[id] = task;
    this._save(_data);
    render.successCreate(task);
  }

  async deleteItems(ids) {
    ids = await this._validateIDs(ids);
    const _data = await this._data();

    for (const _id of ids) {
      await this._saveItemToArchive(_data[_id]);
      delete _data[_id];
    }

    await this._save(_data);
    render.successDelete(ids);
  }

  async displayArchive() {
    render.displayByDate(await this._groupByDate(this._archive, await this._getDates(this._archive)));
  }

  async displayByBoard() {
    render.displayByBoard(await this._groupByBoard());
  }

  async displayByDate() {
    render.displayByDate(await this._groupByDate());
  }

  async displayStats() {
    render.displayStats(await this._getStats());
  }

  async editDescription(input) {
    const targets = input.filter(x => x.startsWith('@'));

    if (targets.length === 0) {
      render.missingID();
      process.exit(1);
    }

    if (targets.length > 1) {
      render.invalidIDsNumber();
      process.exit(1);
    }

    const [target] = targets;
    const id = this._validateIDs(target.replace('@', ''));
    const newDesc = input.filter(x => x !== target).join(' ');

    if (newDesc.length === 0) {
      render.missingDesc();
      process.exit(1);
    }

    const _data = await this._data();
    _data[id].description = newDesc;
    this._save(_data);
    render.successEdit(id);
  }

  async findItems(terms) {
    const result = {};
    const _data = await this._data();

    Object.keys(_data).forEach(id => {
      if (!this._hasTerms(_data[id].description, terms)) {
        return;
      }

      result[id] = _data[id];
    });

    render.displayByBoard(await this._groupByBoard(result));
  }

  async listByAttributes(terms) {
    let [boards, attributes] = [[], []];
    const storedBoards = await this._getBoards();

    terms.forEach(x => {
      if (storedBoards.indexOf(`@${x}`) === -1) {
        return x === 'myboard' ? boards.push('My Board') : attributes.push(x);
      }

      return boards.push(`@${x}`);
    });

    [boards, attributes] = [boards, attributes].map(x => this._removeDuplicates(x));

    const data = await this._filterByAttributes(attributes);
    render.displayByBoard(await this._groupByBoard(data, boards));
  }

  async moveBoards(input) {
    let boards = [];
    const targets = input.filter(x => x.startsWith('@'));

    if (targets.length === 0) {
      render.missingID();
      process.exit(1);
    }

    if (targets.length > 1) {
      render.invalidIDsNumber();
      process.exit(1);
    }

    const [target] = targets;
    const id = await this._validateIDs(target.replace('@', ''));

    input.filter(x => x !== target).forEach(x => {
      boards.push(x === 'myboard' ? 'My Board' : `@${x}`);
    });

    if (boards.length === 0) {
      render.missingBoards();
      process.exit(1);
    }

    boards = this._removeDuplicates(boards);

    const _data = await this._data();
    _data[id].boards = boards;
    this._save(_data);
    render.successMove(id, boards);
  }

  async restoreItems(ids) {
    ids = this._validateIDs(ids, await this._getIDs(this._archive));
    const {_archive} = this;

    ids.forEach(id => {
      this._saveItemToStorage(_archive[id]);
      delete _archive[id];
    });

    this._saveArchive(_archive);
    render.successRestore(ids);
  }

  async starItems(ids) {
    ids = await this._validateIDs(ids);
    const _data = await this._data();
    const [starred, unstarred] = [[], []];

    ids.forEach(id => {
      _data[id].isStarred = !_data[id].isStarred;
      return _data[id].isStarred ? starred.push(id) : unstarred.push(id);
    });

    this._save(_data);
    render.markStarred(starred);
    render.markUnstarred(unstarred);
  }

  async updatePriority(input) {
    const level = input.find(x => ['1', '2', '3'].indexOf(x) > -1);

    if (!level) {
      render.invalidPriority();
      process.exit(1);
    }

    const targets = input.filter(x => x.startsWith('@'));

    if (targets.length === 0) {
      render.missingID();
      process.exit(1);
    }

    if (targets.length > 1) {
      render.invalidIDsNumber();
      process.exit(1);
    }

    const [target] = targets;
    const id = await this._validateIDs(target.replace('@', ''));

    const _data = await this._data();
    _data[id].priority = level;
    this._save(_data);
    render.successPriority(id, level);
  }

  async clear() {
    const ids = [];
    const _data = await this._data();

    Object.keys(_data).forEach(id => {
      if (_data[id].isComplete) {
        ids.push(id);
      }
    });

    if (ids.length === 0) {
      return;
    }

    await this.deleteItems(ids);
  }
}

module.exports = new Taskbook();
