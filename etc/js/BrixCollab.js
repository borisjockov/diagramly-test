/*
 * $Id: BrixCollab.js,v 1.1 2012-06-14 06:10:48 gaudenz Exp $
 * Copyright (c) 2006-2011, JGraph Ltd
 */
// Old collab using Brix. Currently not used. See:
// - https://developers.google.com/google-apps/brix/?hl=de-DE
// - https://code.google.com/apis/console/?pli=1#project:420247213240
/*
// Loads collab if inside an iframe
if (window != window.top)
{
	mxscript('https://docs.google.com/brix/static/api/js/api.js');
	mxscript('/js/collab/Collab.js');
}
*/
goog.collab.load(function()
{
	// Checks if we're inside an iframe (google docs)
	if (window != window.top)
	{
		collab = new goog.collab.CollaborativeApp();
	}
});

// Called in postInit (must be called after graph.init)
function startCollab()
{
	// Codec for embedded complex objects (eg. geometry)
	var codec = new mxCodec();
	var changes = null;
	
	// Adds collaboration
	collab.addListener(goog.collab.CollaborativeApp.EventTypes.MODEL_LOAD, function(model)
    {
		// Uses session ID as prefix for unique new cell IDs
		graph.model.prefix = collab.getSessionId() + '-';
    	collab.root = collab.getModel().getRoot();

		// Adds existing cells from graph model into collab model recursively
    	// and installs the required listeners to keep stuff in sync
		var putCell = function(cell)
		{
			if (!collab.root.containsKey(cell.id))
			{
				// The change events for these can be ignored as the information
				// is collected in getCell when the cell is initially created.
				var map = collab.getModel().createMap();
				
				if (cell.vertex)
				{
					map.put('vertex', '1');
				}
				else if (cell.edge)
				{
					map.put('edge', '1');
				}
				
				// True (default) is ignored
				if (!cell.visible)
				{
					map.put('visible', (cell.visible) ? '1' : '0');
				}
				
				// False (default) is ignored
				if (cell.collapsed)
				{
					map.put('collapsed', (cell.collapsed) ? '1' : '0');
				}
	
	    		// True (default) is ignored
				if (!cell.connectable)
				{
					map.put('connectable', (cell.connectable) ? '1' : '0');
				}
				
				if (cell.value != null)
				{
					map.put('value', String(cell.value));
				}
				
				if (cell.style != null)
				{
					map.put('style', cell.style);
				}
				
				if (cell.geometry != null)
				{
					map.put('geometry', mxUtils.getXml(codec.encode(cell.geometry)));
				}
	
				if (cell.source != null)
				{
					map.put('source', String(cell.source.id));
				}
				
				if (cell.target != null)
				{
					map.put('target', String(cell.target.id));
				}
	
				// Poor mans CollabList c'tor
				var children = collab.getModel().createList();
				
				var childCount = graph.model.getChildCount(cell);
				
				if (childCount > 0)
				{
	    			for (var i = 0; i < childCount; i++)
	    			{
	    				var child = putCell(graph.model.getChildAt(cell, i));
	    				children.add(String(child.id));
	    			}
				}

				map.put('children', children);
				collab.root.put(cell.id, map);
				addCellValueListener(cell, map);
	    		//mxLog.debug('add map: '+cell.id);
			}
			
			return cell;
		};
		
		// Creates cell instance from information in collab model and
		// installs the required listeners to keep the instance in sync
		var getCell = function(id)
		{
    		var map = collab.root.get(id);
    		var cell = new mxCell();
    		cell.id = id;
    		
    		if (map.containsKey('vertex'))
    		{
    			cell.vertex = true;
    		}
    		else if (map.containsKey('edge'))
    		{
    			cell.edge = true;
    		}

    		if (map.containsKey('value'))
    		{
    			cell.value = map.get('value');
    		}
    		
    		if (map.containsKey('style'))
    		{
    			cell.style = map.get('style');
    		}
    		
    		if (map.containsKey('geometry'))
    		{
    			cell.geometry = codec.decode(mxUtils.parseXml(map.get('geometry')).documentElement);
    		}
    		
    		if (map.containsKey('connectable'))
    		{
    			cell.connectable = map.get('connectable') == '1';
    		}
    		
    		if (map.containsKey('visible'))
    		{
    			cell.visible = map.get('visible') == '1';
    		}
    		
    		if (map.containsKey('collapsed'))
    		{
    			cell.collapsed = map.get('collapsed') == '1';
    		}
    		
    		if (map.containsKey('children'))
    		{
	    		var list = map.get('children');
	    		
	    		for (var i = 0; i < list.size(); i++)
	    		{
	    			var childId = list.get(i);
	    			var child = graph.model.getCell(childId);
	    			
	    			// Child is not yet in model so it's created from collab.
	    			if (child == null)
	    			{
	    				child = getCell(childId);
	    			}
	    			
	    			cell.insert(child);
	    		}
    		}
    		
    		addCellValueListener(cell, map);
    		//mxLog.debug('added to graph: '+cell.id);
    		
    		return cell;
		};
		
		// Establishes connections after inserting all cells into the model
		var postProcess = function(cell)
		{
    		var map = collab.root.get(cell.id);
    		
    		if (map != null)
    		{
	    		if (map.containsKey('source'))
	    		{
	    			var terminal = graph.model.getCell(map.get('source'));
	    			terminal.insertEdge(cell, true);
	    		}
	    		
	    		if (map.containsKey('target'))
	    		{
	    			var terminal = graph.model.getCell(map.get('target'));
	    			terminal.insertEdge(cell, false);
	    		}
    		}
    		
    		var childCount = graph.model.getChildCount(cell);
    		
    		if (childCount > 0)
    		{
    			for (var i = 0; i < childCount; i++)
    			{
    				var child = graph.model.getChildAt(cell, i);
    				postProcess(child);
    			}
    		}
		};
		
		// Collects changes into an undoable edit and fires
		// after all edits have been received via timer
		var executeChange = function(change)
		{
			if (changes == null)
			{
				changes = [change];
			}
			else
			{
				changes.push(change);
			}
			
			change.execute();

			window.setTimeout(function()
			{
				if (changes != null)
				{
    	    		var edit = new mxUndoableEdit(graph.model, true);
    	    		edit.changes = changes;
    	    		changes = null;
    	    		
    	    		edit.notify = function()
    	    		{
    	    			edit.source.fireEvent(new mxEventObject(mxEvent.CHANGE,
    	    				'edit', edit, 'changes', edit.changes));
    	    			edit.source.fireEvent(new mxEventObject(mxEvent.NOTIFY,
    	    				'edit', edit, 'changes', edit.changes));
    	    		};
    	    		
    	    		graph.model.fireEvent(new mxEventObject(mxEvent.CHANGE,
	    				'edit', edit, 'changes', edit.changes));
	    			graph.model.fireEvent(new mxEventObject(mxEvent.UNDO, 'edit', edit));
				}
			}, 0);
		};

		// Creates a listener to sync from collab map to cell
    	var addCellValueListener = function(cell, map)
    	{
    		var children = map.get('children');
    		
    		children.addListener(goog.collab.CollaborativeList.EventTypes.VALUES_ADDED, function(evt)
    		{
    			var idx = evt.getIndex();
    			var count = evt.getValues().size();
    			
    			for (var index = idx; index < idx + count; index++)
    			{
    				var childId = children.get(index);
    				var child = graph.model.getCell(childId);
    				var isNew = child == null;
    				
    				// Creates new cell from collab model
    				if (isNew)
    				{
    	    			//mxLog.debug('add cell: ' + childId);
    					child = getCell(childId);
    				}
    				
	    			executeChange(new mxChildChange(graph.model, cell, child, index));
	    			
					// Recursively establishes connections for new child edges
	    			if (isNew)
	    			{
	    				postProcess(child);
	    			}
    			}
    		});
    		
    		map.addListener(goog.collab.CollaborativeMap.EventTypes.VALUE_CHANGED, function(evt)
	    	{
    			var value = evt.getNewValue();
    			
	    		if (value != null)
	    		{
	    			var key = evt.getProperty();
	    			//mxLog.debug('changed: ', cell.id + '.' + key + '=' + value);
	    			
    	    		if (key == 'vertex')
    	    		{
    	    			cell.vertex = true;
    	    		}
    	    		else if (key == 'edge')
    	    		{
    	    			cell.edge = true;
    	    		}
    	    		else if (key == 'connectable')
    	    		{
    	    			cell.connectable = (value == '1');
    	    		}
    	    		else if (key == 'source' || key == 'target')
    	    		{
    	    			var terminal = (value.length > 0) ? graph.model.getCell(value) : null;
    	    			executeChange(new mxTerminalChange(graph.model, cell, terminal, (key == 'source')));
    	    		}
    	    		else if (key == 'value')
    	    		{
    	    			executeChange(new mxValueChange(graph.model, cell, value));
    	    		}
    	    		else if (key == 'style')
    	    		{
    	    			executeChange(new mxStyleChange(graph.model, cell, value));
    	    		}
    	    		else if (key == 'geometry')
    	    		{
    	    			var geometry = codec.decode(mxUtils.parseXml(value).documentElement);
    	    			executeChange(new mxGeometryChange(graph.model, cell, geometry));
    	    		}
    	    		else if (key == 'collapsed')
    	    		{
    	    			executeChange(new mxCollapseChange(graph.model, cell, value == '1'));
    	    		}
    	    		else if (key == 'visible')
    	    		{
    	    			executeChange(new mxVisibleChange(graph.model, cell, value == '1'));
    	    		}
	    		}
	    	});
    	};
    	
    	// Syncs initial state from graph model to collab model
    	// TODO: Move to modelInit event handler or remove
    	if (collab.root.isEmpty())
    	{
    		// Creates an initial test diagram
    		/*graph.getModel().beginUpdate();
    		
    		try
    		{
	        	var v1 = graph.insertVertex(graph.getDefaultParent(), null, 'New Diagram', 20, 20, 120, 120,
	        		'rounded=1;shadow=1;fillColor=#00CCFF;gradientColor=#99CCFF;shape=timerIntermediate;' +
	        		'perimeter=ellipsePerimeter;verticalLabelPosition=bottom;verticalAlign=top;');
	        	var v2 = graph.insertVertex(graph.getDefaultParent(), null, 'New Diagram', 260, 20, 120, 40,
	        		'rounded=1;shadow=1;fillColor=#00CCFF;gradientColor=#99CCFF;');
	        	graph.insertEdge(graph.getDefaultParent(), null, 'New Diagram', v1, v2);
	        	graph.insertVertex(graph.getDefaultParent(), null, 'New Diagram', 260, 120, 120, 40,
        			'rounded=1;shadow=1;fillColor=#00CCFF;gradientColor=#99CCFF;');
    		}
    		finally
    		{
    			graph.getModel().endUpdate();
    		}
    		*/

        	// Recursively add cells to collab model
    		putCell(graph.model.root);
    	}
    	// Syncs initial state from collab model to graph model
    	else
    	{
    		// Makes sure the model is completely empty so that no IDs
    		// are resolved to root or default layer on initial sync.
    		//graph.model.remove(graph.model.root);
    		graph.model.root = null;
    		graph.model.cells = null;
    		
    		// Recursively add cells to graph model. By convention the root
    		// cell always uses ID '0' to be able to restore the hierarchy.
    		//mxLog.debug('reading cell hierarchy');
    		var root = getCell('0');
    		
    		//mxLog.debug('adding cell hierarchy');
    		executeChange(new mxRootChange(graph.model, root));
    		
    		// Requires the mapping from ID to cell to be in place
    		// so must be called after the mxRootChange above. This
    		// works because the above change is carried out immediately
    		// to put the mapping of the cells into the model but the
    		// repaint is delayed until the thread finishes.
    		//mxLog.debug('post-processing');
    		postProcess(root);
    	}

    	// Removes cells from graph model when removed from collab model
    	// See children event listeners for adding cells into the graph
    	collab.root.addListener(goog.collab.CollaborativeMap.EventTypes.VALUE_CHANGED, function(evt)
    	{
    		var key = evt.getProperty();
    		
    		if (evt.getNewValue() == null && graph.model.getCell(key) != null)
    		{
    			//mxLog.debug('remove cell: ' + key);
    			executeChange(new mxChildChange(graph.model, null, graph.model.getCell(key)));
    		}
    	});

    	// Listens to changes on the graph model and maps them to the collab
    	// model as a single transaction.
    	graph.model.addListener(mxEvent.NOTIFY,
			mxUtils.bind(this, function(sender, evt)
			{
				collab.getModel().startCompoundOperation();
				var changes = evt.getProperty('edit').changes;
				
				for (var i = 0; i < changes.length; i++)
				{
					var change = changes[i];
				
					if (change instanceof mxChildChange)
					{
						//mxLog.debug(i, 'mxChildChange');
						// Removes index from old parent
						if (change.previous != null)
						{
							var map = collab.root.get(change.previous.id);
							
							if (map != null)
							{
								var children = map.get('children');
								children.remove(change.previousIndex);
							}
						}
						
						// Inserts or removes child from collab model
						if (change.previous == null && change.parent != null)
						{
							putCell(change.child);
						}
						else if (change.parent == null)
						{
							collab.root.remove(change.child.id);
						}
						
						// Adds index to new parent
						if (change.parent != null)
						{
							var map = collab.root.get(change.parent.id);

							// Change might reference a parent which hasn't been created in the collab
							if (map != null)
							{
								var children = map.get('children');
								children.insert(change.index, String(change.child.id));
								//mxLog.debug('insert '+change.child.id+' into '+change.parent.id+' at ' + change.index);
							}
						}
					}
					else if (collab.root.containsKey(change.cell.id))
					{
    					//mxLog.debug(i, mxUtils.getFunctionName(change.constructor));
						var map = collab.root.get(change.cell.id);
						
						if (change instanceof mxTerminalChange)
    					{
    						var term = graph.model.getTerminal(change.cell, change.source);
    						var key = (change.source) ? 'source' : 'target';
    						var id = (term != null) ? term.id : '';
    						map.put(key, String(id));
    					}
						else if (change instanceof mxGeometryChange)
    					{
    						var xml = mxUtils.getXml(codec.encode(change.cell.geometry));
    						map.put('geometry', xml);
    					}
    					else if (change instanceof mxStyleChange)
    					{
    						map.put('style', change.cell.style);
    					}
    					else if (change instanceof mxValueChange)
    					{
    						map.put('value', String(change.cell.value));
    					}
    					else if (change instanceof mxCollapseChange)
    					{
    						map.put('collapsed', (change.cell.collapsed) ? '1' : '0');
    					}
    					else if (change instanceof mxVisibleChange)
    					{
    						map.put('visible', (change.cell.visible) ? '1' : '0');
    					}
					}
				}
				
				collab.getModel().endCompoundOperation();
			})
		);

    	//mxLog.show();
    	//mxLog.debug('Collab running');
    });
    
    collab.start();
};
