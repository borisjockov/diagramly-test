var Range, applyToShareJS;

Range = require("ace/range").Range;

applyToShareJS = function(editorDoc, delta, doc) {
  var getStartOffsetPosition, pos, text;
  getStartOffsetPosition = function(range) {
    var i, line, lines, offset, _len;
    lines = editorDoc.getLines(0, range.start.row);
    offset = 0;
    for (i = 0, _len = lines.length; i < _len; i++) {
      line = lines[i];
      offset += i < range.start.row ? line.length : range.start.column;
    }
    return offset + range.start.row;
  };
  pos = getStartOffsetPosition(delta.range);
  switch (delta.action) {
    case 'insertText':
      doc.insert(pos, delta.text);
      break;
    case 'removeText':
      doc.del(pos, delta.text.length);
      break;
    case 'insertLines':
      text = delta.lines.join('\n') + '\n';
      doc.insert(pos, text);
      break;
    case 'removeLines':
      text = delta.lines.join('\n') + '\n';
      doc.del(pos, text.length);
      break;
    default:
      throw new Error("unknown action: " + delta.action);
  }
};

window.sharejs.Doc.prototype.attach_ace = function(editor, keepEditorContents) {
  var check, doc, docListener, editorDoc, editorListener, offsetToPos, suppress;
  if (!this.provides['text']) {
    throw new Error('Only text documents can be attached to ace');
  }
  doc = this;
  editorDoc = editor.getSession().getDocument();
  editorDoc.setNewLineMode('unix');
  check = function() {
    return window.setTimeout(function() {
      var editorText, otText;
      editorText = editorDoc.getValue();
      otText = doc.getText();
      if (editorText !== otText) {
        console.error("Text does not match!");
        console.error("editor: " + editorText);
        return console.error("ot:     " + otText);
      }
    }, 0);
  };
  if (keepEditorContents) {
    doc.del(0, doc.getText().length);
    doc.insert(0, editorDoc.getValue());
  } else {
    editorDoc.setValue(doc.getText());
  }
  check();
  suppress = false;
  editorListener = function(change) {
    if (suppress) return;
    applyToShareJS(editorDoc, change.data, doc);
    return check();
  };
  editorDoc.on('change', editorListener);
  docListener = function(op) {
    suppress = true;
    applyToDoc(editorDoc, op);
    suppress = false;
    return check();
  };
  offsetToPos = function(offset) {
    var line, lines, row, _len;
    lines = editorDoc.getAllLines();
    row = 0;
    for (row = 0, _len = lines.length; row < _len; row++) {
      line = lines[row];
      if (offset <= line.length) break;
      offset -= lines[row].length + 1;
    }
    return {
      row: row,
      column: offset
    };
  };
  doc.on('insert', function(pos, text) {
    suppress = true;
    editorDoc.insert(offsetToPos(pos), text);
    suppress = false;
    return check();
  });
  doc.on('delete', function(pos, text) {
    var range;
    suppress = true;
    range = Range.fromPoints(offsetToPos(pos), offsetToPos(pos + text.length));
    editorDoc.remove(range);
    suppress = false;
    return check();
  });
  doc.detach_ace = function() {
    doc.removeListener('remoteop', docListener);
    editorDoc.removeListener('change', editorListener);
    return delete doc.detach_ace;
  };
};
