//  Export for Replia Skecth plugin.
//  export_layers.js
//
//  Created by Hirobe Kazuya on 2015/06/01.
//  Copyright (c) 2015 Bunguu.
//


var _layerIdGenerator = 1;
// -- Utils
var _importScale = 1.0;
var _context;

function exportForReplia(context) {
	_context = context;
	var doc = context.document;

	var app = [NSApplication sharedApplication];

	var filePaths = [];

	var selectedLayers = context.selection;
	if (selectedLayers.count() ==0) {
		showAlert("No layers are selected. Please select the artboard or layers before exporting.");
		return;
	}

	var selectedRect = calcSelectedRect();
    var documentRect = selectedRect;
	var importScale = selectImportScale(documentRect.size.width,documentRect.size.height);
	if (importScale<0) {
		return;
	}

	var savePath = pickFolder();
	if (savePath) {
		exportSelectedLayers(savePath+'/',importScale,documentRect);
	}

}

function pickFolder(baseFolder){
	var panel = [NSSavePanel savePanel];
	[panel setNameFieldStringValue:"export.repliaImp"];
	panel.setCanCreateDirectories(true);

	panel.setAllowedFileTypes(["repliaImp"]);
	panel.setCanSelectHiddenExtension(true);

	var button = panel.runModal();
	if (button == NSFileHandlingPanelOKButton){
		return [[panel URL] path];
	}else{
		return null;
	}
}

var _progressCount = 0;
function showProgress() {
	var doc = _context.document
	if (_progressCount<0) {
	    [doc showMessage:null];
	}else{
	    [doc showMessage:"Exporting ..."];
	}
}

function showAlert(msg){
	var app = [NSApplication sharedApplication];
  [app displayDialog:msg withTitle:"Export for Replia"]
}

function createSelect(msg, items, selectedItemIndex){
  selectedItemIndex = selectedItemIndex || 0

  var accessory = [[NSComboBox alloc] initWithFrame:NSMakeRect(0,0,200,25)]
  [accessory addItemsWithObjectValues:items]
  [accessory selectItemAtIndex:selectedItemIndex]

  var alert = [[NSAlert alloc] init]
  [alert setMessageText:msg]
  [alert addButtonWithTitle:'OK']
  [alert addButtonWithTitle:'Cancel']
  [alert setAccessoryView:accessory]

  var responseCode = [alert runModal]
  var sel = [accessory indexOfSelectedItem]

  return [responseCode, sel]
}

function selectImportScale(documentWidth,documentHeight) {
	var message = "Export for Replia\n\n";
	message += "Selected layers size is "+documentWidth+"x"+documentHeight+"px.\n";
	message += "Please select import scale.";
	var options = ['100%', '50% (for @2x)', '33.3% (for @3x)']
	var values = [1.0, 2.0, 3.0];

	var choice = createSelect(message ,options, prefferdScaleIndex(documentWidth))
	if (choice[0]!=1000) {
		//canceled
		return -1.0;
	}
	var selected = choice[1];
	return values[selected];
}

function prefferdScaleIndex(width) {
	if (width == 320 || width == 375 || width == 768 || width == 1024) {
		return 0;
	}else if (width == 640 || width == 750 || width == 828 || width == 768*2 || width == 1024*2) {
		return 1;
	}else if (width == 1242) {
		return 2;
	}
	return 0;
}

function calcSelectedRect() {
	var doc = _context.document
	var page = [doc currentPage];
	var pageChildren = [page children];
	var dLeft,dTop,dRight,dBottom;

	for (var i=0; i<[pageChildren count];i++) {
		var layer = [pageChildren objectAtIndex:i];
		if (layer.isSelected()) {
			var rect = layer.absoluteRect();
			if (dLeft === undefined || dLeft > rect.x()) {
				dLeft  = rect.x();
			}
			if (dTop === undefined || dTop > rect.y()) {
				dTop  = rect.y();
			}
			if (dRight === undefined || dRight < rect.x()+rect.width()) {
				dRight  = rect.x()+rect.width();
			}
			if (dBottom === undefined || dBottom < rect.y()+rect.height()) {
				dBottom  = rect.y()+rect.height();
			}
		}
	}
	var width = dRight - dLeft;
	var height = dBottom - dTop;

	return CGRectMake(dLeft,dTop,width,height);
}

function exportSelectedLayers(folderPath,importScale,documentRect) {
	_importScale = importScale;

	// if folder exists then remove it
	var fileManager = [NSFileManager defaultManager];
	if ([fileManager fileExistsAtPath:folderPath]) {
		[fileManager removeItemAtPath:folderPath error:null];
	}


	var doc = _context.document
	var page = [doc currentPage];
	var workPage = [page copy]
	workPage.setName([page name] + " temporary:");

	var pageChildren = [page children];
	var workChildren = [workPage children];

	var workLayers = [];
	for (var i=0; i<[pageChildren count];i++) {
		if ([pageChildren objectAtIndex:i].isSelected()) {
			workLayers.push([workChildren objectAtIndex:i]);
		}
	}

	var layers = [];
	var jsons = [];
	_layerIdGenerator = 1;

	_progressCount = 0;
	showProgress();
	for (var i=0; i < workLayers.length; i++)
	{
		var layer = workLayers[workLayers.length - i -1];
		var layerJson = (walksThrough(layer,folderPath,null,null,documentRect));

		jsons.push(layerJson);
	}

	var json = {};
	json['importScale'] = importScale;
	json['sourceApplication'] = 'Sketh 3';
	json['resolution'] = 72;

	if (jsons.length == 1) {
		json['layers'] = jsons[0]['layers'];
		json['bounds'] = json['bounds'];
	}else {
		json['layers'] = jsons;
		json['bounds'] = json['layers'][0]['bounds'];

	}
	json['bounds'] = {'left':0,'top':0,'right':0+documentRect.size.width,'bottom':0+documentRect.size.height};

	// walk throw artboard
	var jsonText = ""+ JSON.stringify( json, undefined, 2);
	var path = folderPath+'psdInfo.json';


	var writeString = [NSString stringWithFormat:"%@", jsonText];
	[writeString writeToFile:path
							atomically:true
							encoding:NSUTF8StringEncoding
							error:null];

	var editJson = walkEditJson(json);
	var writeEditJsonString = [NSString stringWithFormat:"%@",  JSON.stringify( editJson, undefined, 2)];
	[writeEditJsonString writeToFile:folderPath+'edited.json'
												atomically:true
												encoding:NSUTF8StringEncoding
												error:null];

	_progressCount = -1;
	showProgress();

}

function walkEditJson(json) {
	var editJson = {};

	if (json && json['pngName']) {
		editJson['needsImage'] = 'complete';
	}
	//editJson['layerId'] = json['id'];

	var children = json['layers'];
	if (children) {
		editJson['children'] = [];
		for (var i=children.length-1;i>=0;i--) {

			editJson['children'].push(walkEditJson(children[i]));
		}
	}

	return editJson;
}

function outputLayerAsImage(layer,folderPath,index,maskRect,documentRect) {
	outputLayerAsPngWithScale(layer,folderPath+index,2,"@2x.png",maskRect,documentRect);
	outputLayerAsPngWithScale(layer,folderPath+index,3,"@3x.png",maskRect,documentRect);
}

function outputLayerAsPngWithScale(layer,path,scaleValue,suffix,maskRect,documentRect) {

	// Clear all exportable sizes
    [layer exportOptions].removeAllExportFormats()

    [[layer exportOptions] addExportFormat];
    var format = [[[layer exportOptions] exportFormats] lastObject];
    //format.format = "png";
    [format setFileFormat:"png"];
    [format setScale:scaleValue/ _importScale];
    [format setName:""];

  var doc = _context.document;
  var page = doc.currentPage();
  if (MSApplicationMetadata.metadata().appVersion < 45) {
    page.deselectAllLayers();
    layer.select_byExpandingSelection(true, true);
  } else {
    page.changeSelectionBySelectingLayers_([]);
    layer.select_byExtendingSelection(true, true);
  }
  
  var rect = [layer absoluteInfluenceRect];
	if (maskRect) {
		var left = Math.max(rect.origin.x,maskRect.left + documentRect.origin.x);
		var top = Math.max(rect.origin.y,maskRect.top + documentRect.origin.y);
		var right = Math.min(rect.origin.x+rect.size.width,maskRect.right + documentRect.origin.x);
		var bottom = Math.min(rect.origin.y+rect.size.height,maskRect.bottom +  documentRect.origin.y);
		rect = CGRectMake(left,top,right-left,bottom-top);
	}

    var slice = [MSExportRequest exportRequestFromExportFormat:format layer:layer inRect:rect useIDForName:false];

	[doc saveArtboardOrSlice: slice toFile: path+suffix];
}

function walksThrough(layer,folderPath,parentJson,maskRect,documentRect) {
	//print(layer.treeAsDictionary());

	var json = {};

	json['id'] = _layerIdGenerator;
	_layerIdGenerator += 1;

	json['blendOptions'] = {};

	var isRectView = false;

	json['name'] = ""+layer.name();
	json['bounds'] = parseFrame(layer,parentJson,maskRect,documentRect);
	json['clipped'] = false;
	json['visible'] = true;

	if ([layer isMemberOfClass:[MSTextLayer class]])
	{
		outputLayerAsImage(layer,folderPath,json['id'],null,documentRect);
		json['needsImage'] = 'complete';

		json['type'] = 'textLayer';
		json['boundsWithFX'] = parseImageFrame(layer,parentJson,null,documentRect);
		json['bounds'] = parseFrame(layer,parentJson,null,documentRect); //over write

		var textItem = {};
		var str = ""+[layer stringValue];
		str = str.replace(/\n/g, '\r');

		textItem['textKey'] = str;
		textItem['boundingBox'] = {'left':0,'top':0,
			'right':json['bounds'].right-json['bounds'].left,
			'bottom':json['bounds'].bottom-json['bounds'].top};
		textItem['bounds'] = textItem['boundingBox'];

		var textColor = layer.textColor();
		var fillColor = parseFillColor(layer);
		if (fillColor) {
			textColor = fillColor;
		}

		var alpha = parseAlpha(layer,textColor);
		if (alpha && alpha < 100.0) {
			json['blendOptions']['opacity'] = {'value':alpha};
		}

		var textStyle = {};
		textStyle['size'] = layer.fontSize();
		textStyle['fontName'] = ""+layer.fontPostscriptName();
		textStyle['fontPostScriptName'] = ""+layer.fontPostscriptName();
		textStyle['color'] = parseColor(textColor);
		textStyle['leading'] = /*layer.fontSize() +*/ layer.lineHeight();

		textStyle['isTunedBox'] = true

		textItem['textStyleRange'] = [{'textStyle':textStyle}];

		json['text'] = textItem;

	}else if ([layer isKindOfClass:[MSRectangleShape class]])
	{
		json['type'] = 'shapeLayer';
		json['boundsWithFX'] = parseImageFrame(layer,parentJson,maskRect,documentRect);

		outputLayerAsImage(layer,folderPath,json['id'],maskRect,documentRect);
		json['needsImage'] = 'complete';

		var fillColor = parseFillColor(layer);
		if (fillColor) {
			json['fill'] = {'color':parseColor(fillColor)),
											'class':'solidColorLayer'};
		}
		var alpha = parseAlpha(layer,fillColor)
		if (alpha && alpha < 100.0) {
			json['blendOptions']['opacity'] = {'value':alpha};
		}

	}else if ([layer isKindOfClass:[MSBitmapLayer class]]||
						[layer isKindOfClass:[MSShapePathLayer class]])
	{
		json['type'] = 'shapeLayer';
		json['pngName'] = ""+layer.name();
		json['boundsWithFX'] = parseImageFrame(layer,parentJson,maskRect,documentRect);

		outputLayerAsImage(layer,folderPath,json['id'],maskRect,documentRect);
		json['needsImage'] = 'complete';
	}else if ([layer isKindOfClass:[MSShapeGroup class]])
	{
		json['type'] = 'shapeLayer';
		json['boundsWithFX'] = parseImageFrame(layer,parentJson,maskRect,documentRect);
		var isImage = true;

		outputLayerAsImage(layer,folderPath,json['id'],maskRect,documentRect);
		json['needsImage'] = 'complete';

		// fillsが複数あるなら、imageにすべき？
		var fillColor = parseFillColor(layer);
		if (fillColor) {
			json['fill'] = {'color':parseColor(fillColor)),
											'class':'solidColorLayer'};
		}
		var alpha = parseAlpha(layer,fillColor)
		if (alpha && alpha < 100.0) {
			json['blendOptions']['opacity'] = {'value':alpha};
		}


		var layers = [layer layers];
		if ([layers count]==1 &&
				[[layers objectAtIndex:0] isKindOfClass:[MSRectangleShape class]])
		{
			isImage = false;
			isRectView = true;
		}


		if (isImage) {
			json['pngName'] = ""+layer.name();
		}

		if (layer.style()) {
			var style = layer.style();
			var borders = style.borders(); // MSStyleBorderCollection
			if ([borders count]>0) {
				var border = [borders objectAtIndex:0]; // MSStyleBoder
				var borderColor = parseColor(border.color());
				var borderWidth = border.thickness();
				var position = border.position(); // 0:center, 1:Inside, 2:Outside
				var isEnabled = border.isEnabled(); // 1:checked
				if (isEnabled || borderColor["alpha"]>0.0) {

					var scale = 1.0;
					if (position == 1) {
						/*
						json['bounds']['top'] += borderWidth/2.0 /scale;
						json['bounds']['left'] += borderWidth/2.0 /scale;
						json['bounds']['bottom'] -= borderWidth/2.0 /scale;
						json['bounds']['right'] -= borderWidth/2.0 /scale;
						*/
					}else if (position == 2) {

						json['bounds']['top'] -= borderWidth/1.0 /scale ;
						json['bounds']['left'] -= borderWidth/1.0 /scale;
						json['bounds']['bottom'] += borderWidth/1.0 /scale;
						json['bounds']['right'] += borderWidth/1.0 /scale;

					}else if (position == 0) {
						json['bounds']['top'] -= borderWidth/2.0 /scale ;
						json['bounds']['left'] -= borderWidth/2.0 /scale;
						json['bounds']['bottom'] += borderWidth/2.0 /scale;
						json['bounds']['right'] += borderWidth/2.0 /scale;

					}

					json['strokeStyle'] = {
						'strokeStyleContent':{'color':borderColor},
						'strokeStyleLineWidth':borderWidth,
						'strokeStyleOpacity':{'value':borderColor['alpha']*100.0}
					};

				}
			}
		}

	}else if ([layer isKindOfClass:[MSLayerGroup class]])
	{

	}else {

	}

	if (json['pngName']) {
		json['bounds'] = json['boundsWithFX'];
	}

	if (layer.hasClippingMask() ) {
		if (maskRect) {
			json['nextMaskRect'] = {
				'top': Math.max(json['bounds']['top'],maskRect.top),
				'left': Math.max(json['bounds']['left'],maskRect.left),
				'bottom': Math.min(json['bounds']['bottom'],maskRect.bottom),
				'right': Math.min(json['bounds']['right'],maskRect.right)
			};
		}else {
			json['nextMaskRect'] = {
				'top':json['bounds']['top'],
				'left':json['bounds']['left'],
				'bottom':json['bounds']['bottom'],
				'right':json['bounds']['right']
			};
		}
	}
    //print("x:"+layer.frame().x() +",y:"+layer.frame().y());
	if (isRectView==false && !json['pngName'] &&
			([layer isKindOfClass:[MSLayerGroup class]] ||
						[layer isKindOfClass:[MSShapeGroup class]] ||
                    [layer isKindOfClass:[MSSymbolInstance class]] ))
	{
		outputLayerAsImage(layer,folderPath,json['id'],maskRect,documentRect);
		json['needsImage'] = 'complete';

		var layers ;
        var childDocumentRect = documentRect;
//        layers = [];
        if ([layer isKindOfClass:[MSSymbolInstance class]]) {
            // find symbol artboard page
            var documentData = _context.document.documentData();
            var page = documentData.currentPage();

            var symbolID = layer.symbolID();
            //print("symbolID:"+symbolID);

            var filter = NSPredicate.predicateWithFormat("className == 'MSSymbolMaster'");
            var artboards = documentData.allArtboards().filteredArrayUsingPredicate(filter);
            var targetPage = findParentPage(findArtboardWithSymbol(artboards,symbolID));
            if (targetPage) {
                // make copy of the page and find the target symbol artboard
                var artboardIndex = -1;
                for (var i=0; i < targetPage.artboards().count(); i ++) {
                    var targetArtboard = targetPage.artboards()[i];
                    if (![targetArtboard isKindOfClass:[MSSymbolMaster class]]) { continue; }
                    if (""+symbolID == ""+targetArtboard.symbolID() ) {
                         artboardIndex = i;
                    }
                }
                if (artboardIndex >= 0) {
                    //print("targetPage:"+symbolID);
                    var workPage = [targetPage copy];
                    var workArtboards = workPage.artboards().filteredArrayUsingPredicate(filter);
                    var workArtboard = workPage.artboards()[artboardIndex];

                    layers = [workArtboard layers];
                    //print(workArtboard.treeAsDictionary());
                    var frame = workArtboard.frame();

                    childDocumentRect = CGRectMake(frame.x()-json["bounds"].left,frame.y()-json["bounds"].top,frame.width(),frame.height());
                    //print(childDocumentRect);
                }
            }

        } else {
            layers = [layer layers];
        }

        if (layers) {
            var jsons = [];
    		var masks = [];
    		var currentMaskRect = maskRect;
    		for (var i= [layers count]-1; i>=0; i--)
    		{
    			var newMask = null;
    			var childLayer = [layers objectAtIndex:[layers count]-i-1];
    			childJson = walksThrough(childLayer,folderPath,json,currentMaskRect,childDocumentRect);
    			jsons.unshift(childJson);

    			if (childJson['nextMaskRect']) {
    				currentMaskRect = childJson['nextMaskRect'];
    			}

    		}
    		json['layers'] = jsons;
        }
	}

	_progressCount +=1;
	showProgress();
	return json;
}

function parseFillColor(layer) {
	if (!layer['style']) return null;

	var fill = layer.style().fills().firstObject();
	var fillCount = layer.style().fills().count();
	var fillColor;
	if (fill) {
		// fill (0), gradient (1) or pattern (4
		if (fill.fillType() == 0) {
			fillColor = fill.color()
			return fillColor;
		}
	}
	return null;
}

function parseImageFrame(layer,parentJson,maskRect,documentRect) {
//	return parseFrameW(layer,parentJson,true);

	var rect = [layer absoluteInfluenceRect];

	var item = {};
	item.left = rect.origin.x;
	item.top = rect.origin.y;

	item.right = item.left + rect.size.width;
	item.bottom = item.top + rect.size.height;

	item.left = Math.round(item.left * 1000)/1000 - documentRect.origin.x;
	item.top = Math.round(item.top * 1000)/1000 - documentRect.origin.y;
	item.right = Math.round(item.right * 1000)/1000 - documentRect.origin.x;
	item.bottom = Math.round(item.bottom * 1000)/1000 - documentRect.origin.y;

	if (maskRect) {
		item.left =	Math.max(maskRect.left, item.left);
		item.top =	Math.max(maskRect.top, item.top);
		item.right =	Math.min(maskRect.right, item.right);
		item.bottom =	Math.min(maskRect.bottom, item.bottom);
	}

	return item;
}

function parseFrame(layer,parentJson,maskRect,documentRect) {
	var rect = [layer absoluteRect]; //GKRect
	var item = {};

	item.left = rect.x();
	item.top = rect.y();

	item.right = item.left + rect.width();
	item.bottom = item.top + rect.height();

	item.left = Math.round(item.left * 1000)/1000 - documentRect.origin.x;
	item.top = Math.round(item.top * 1000)/1000 - documentRect.origin.y;
	item.right = Math.round(item.right * 1000)/1000 - documentRect.origin.x;
	item.bottom = Math.round(item.bottom * 1000)/1000 - documentRect.origin.y;

	if (maskRect) {
		item.left =	Math.max(maskRect.left, item.left);
		item.top =	Math.max(maskRect.top, item.top);
		item.right =	Math.min(maskRect.right, item.right);
		item.bottom =	Math.min(maskRect.bottom, item.bottom);
	}

	return item;
}

function parseColor(color)
{
	var item = {};
  item.red = color.red()*255.0;
	item.green = color.green()*255.0;
	item.blue = color.blue()*255.0;
	item.alpha = color.alpha();
	return item;
}

function parseAlpha(layer,color) {
	if (!color) return 100.0;
	if (!layer['style']) return null;

	var alpha = 100.0;
	if (layer.style().contextSettings().opacity()) {
		alpha *= layer.style().contextSettings().opacity();
	}
	if (color) {
		alpha *= color.alpha();
	}
	return alpha;
}

function findArtboardWithSymbol(artboards,symbolID) {
    for (var i= 0; i<artboards.length; i++)
    {
        var artboard = artboards[i];
        //print(""+symbolID + ","+artboard.symbolID());
        if (""+symbolID == ""+artboard.symbolID() ) {
            return artboard;
        }
    }
    return null;
}

function findParentPage(layer) {
    if (!layer) { return null; }
    var parentGroup = [layer parentGroup];
    if (!parentGroup) { return null; }
    if ([parentGroup isKindOfClass:[MSPage class]]) {
        return parentGroup;
    }
    return findParentPage(parentGroup);
}
