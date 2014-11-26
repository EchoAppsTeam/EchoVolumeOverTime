(function($) {
"use strict";

var volume = Echo.App.manifest("Echo.Apps.VolumeOverTime");

if (Echo.App.isDefined(volume)) return;

volume.vars = {
	"chart": undefined,
	"period": undefined,
	"periods": [],
	"visible": true,
	"watchers": {},
	"months": [
		"Jan", "Feb", "Mar", "Apr", "May", "Jun",
		"Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
	]
};

volume.labels = {
	"noData": "No data yet.<br>Stay tuned!"
};

volume.config = {
	"targetURL": undefined,
	// amount of items to retrieve from StreamServer
	// 100 is the limitation on the amount of root items
	"maxItemsToRetrieve": 100,
	"chartUpdateDelay": 5000, // in ms
	"presentation": {
		"visualization": "bar", // or "line"
		"minIntervals": 3,
		"maxIntervals": 10,
		"maxWidth": 700, // in px
		"aspectRatio": 1.8, // width/height proportion
		"fillColor": "#D8D8D8",
		"strokeColor": "#C0C0C0",
		"highlightFill": "#C0C0C0",
		"highlightStroke": "#C0C0C0"
	},
	"chart": {
		"tooltipTemplate": "<%=value%>",
		"scaleShowGridLines": false,
		"scaleLineColor": "inherit",
		"scaleLabel": " ", // keep " ", not ""!
		"responsive": true,
		"barStrokeWidth": 1,
		"scaleBeginAtZero": true
	},
	"dependencies": {
		"StreamServer": {
			"appkey": undefined,
			"apiBaseURL": "{%= apiBaseURLs.StreamServer.basic %}/",
			"liveUpdates": {
				"transport": "websockets",
				"enabled": true,
				"websockets": {
					"URL": "{%= apiBaseURLs.StreamServer.ws %}/"
				}
			}
		}
	}
};

volume.dependencies = [{
	"url": "{config:cdnBaseURL.sdk}/api.pack.js",
	"control": "Echo.StreamServer.API"
}, {
	"url": "{%= appBaseURLs.prod %}/third-party/chart.min.js",
	"loaded": function() { return !!window.Chart; }
}];

volume.labels = {
	"noData": "No data yet.<br>Stay tuned!"
};

volume.init = function() {
	var app = this;

	// check for "targetURL" field, without
	// this field we are unable to retrieve any data
	if (!this.config.get("targetURL")) {
		this.showMessage({
			"type": "error",
			"message": "Unable to retrieve data, target URL is not specified."
		});
		return;
	}

	// spin up document visibility watcher to stop
	// chart rendering in case a page is not active
	var watcher = app._createDocumentVisibilityWatcher();
	if (watcher) {
		watcher.start(function() {
			app.set("visible", true);
			app.refresh();
		}, function() {
			app.set("visible", false);
		});
		app.set("watchers.visibility", watcher);
	}

	// create chart update watcher to prevent
	// massive amount of chart update calls
	app.set("watchers.update", app._createUpdateWatcher());

	app.request = app._getRequestObject();

	var data = app.get("data");
	if ($.isEmptyObject(data)) {
		app.request.send();
	} else {
		app._getHandlerFor("onData")(data);
		app.request.send({
			"skipInitialRequest": true,
			"data": {
				"q": app._assembleQuery(),
				"appkey": app.config.get("dependencies.StreamServer.appkey"),
				"since": data.nextSince
			}
		});
	}
};

volume.destroy = function() {
	$.each(this.get("watchers"), function(_, watcher) {
		watcher.stop();
	});
};

volume.methods.template = function() {
	return this.templates[this._hasData() ? "main" : "empty"];
};

volume.templates.main =
	'<div class="{class:container}">' +
		'<div class="{class:subcontainer}">' +
			'<canvas class="{class:graph}"></canvas>' +
		'</div>' +
	'</div>';

volume.templates.empty =
	'<div class="{class:empty}">' +
		'<span class="{class:message}">{label:noData}</span>' +
	'</div>';

volume.methods._hasData = function() {
	return !!this.config.get("data.entries", []).length;
};

volume.renderers.container = function(element) {
	element.css({"max-width": parseInt(this.config.get("presentation.maxWidth") + "px")});
	return element;
};

volume.methods.template = function() {
	return this.templates[this._hasData() ? "main" : "empty"];
};

volume.methods._hasData = function() {
	var entries = this.config.get("data.entries", []);
	return !!entries.length;
};

volume.methods._initChart = function(target) {
	var presentation = this.config.get("presentation");
	var periods = Echo.Utils.foldl(
		{"labels": [], "data": []},
		this.get("periods"),
		function(point, acc) {
			acc.labels.push(point.label);
			acc.data.push(point.count);
		}
	);
	var data = {
		"labels": periods.labels,
		"datasets": [{
			"data": periods.data,
			"fillColor": presentation.fillColor,
			"strokeColor": presentation.strokeColor,
			"highlightFill": presentation.highlightFill,
			"highlightStroke": presentation.highlightStroke
		}]
	};
	var ctx = target.get(0).getContext("2d");

	// define proper aspect ratio
	var width = parseInt(target.width());
	if (ctx.canvas && width && presentation.aspectRatio) {
		ctx.canvas.width = width;
		ctx.canvas.height = width / presentation.aspectRatio;
	}

	var type = presentation.visualization === "bar" ? "Bar" : "Line";
	return new Chart(ctx)[type](data, this.config.get("chart"));
};

volume.methods._normalizeEntries = function(entries) {
	return Echo.Utils.foldl([], entries, function(entry, acc) {
		if (entry.verbs[0] === "http://activitystrea.ms/schema/1.0/post") {
			entry.timestamp = Echo.Utils.timestampFromW3CDTF(entry.object.published);
			acc.push(entry);
		}
	});
};

volume.methods._placeIntoPeriods = function(entries, updateChart) {
	if (!entries || !entries.length) return;
	var app = this;
	var chart = this.get("chart");
	var periods = this.get("periods", []);
	var visualization = this.config.get("presentation.visualization");
	$.map(entries, function(entry) {
		var placed = false;
		$.each(periods, function(id, period) {
			if (app._isWithinPeriod(entry, period)) {
				period.count++;
				if (updateChart) {
					var type = visualization === "line" ? "points" : "bars";
					if (chart.datasets[0][type][id]) {
						chart.datasets[0][type][id].value = period.count;
						app.get("watchers.update").start();
					}
				}
				placed = true;
				return false; // break
			}
		});
		var period = periods[periods.length - 1];
		var nextPeriodStart = period.start + app.get("period.interval");
		if (!placed && entry.timestamp > nextPeriodStart) {
			app._createPeriod(nextPeriodStart, 1, "push", true);
		}
	});
};

volume.methods._cleanupPeriods = function() {
	var limit = this.config.get("presentation.minIntervals");
	var periods = this.get("periods", []);
	var nonEmptyIntervalSeen = false;
	var filter = function(period, id) {

		// display everything after first non-empty interval
		if (nonEmptyIntervalSeen) return true;

		nonEmptyIntervalSeen = period.count > 0;

		// we get rid of empty intervals, but keep a number of
		// intervals (defined within "presentation.minIntervals")
		// even if they are empty, so that we can render a graph
		return nonEmptyIntervalSeen || ((periods.length - 1) - id < limit);
	};
	this.set("periods", $.grep(periods, filter));
};

volume.methods._getTimestampTranslation = function(timestamp) {
	var app = this;
	var date = new Date(timestamp * 1000);
	// convert to 12-hour time format
	var getHour = function() {
		var hour = date.getHours() % 12;
		return hour === 0 ? 12 : hour;
	};
	var getLabelForMonth = function(n) {
		return app.labels.get(app.get("months")[n]);
	};
	switch (this.get("period.type")) {
		case "min":
			var mins = date.getMinutes();
			return getHour() + ":" + (mins > 9 ? mins : "0" + mins);
		case "hour":
			return getHour() + ":00";
		case "day":
			return getLabelForMonth(date.getMonth()) + " " + (date.getDate());
		case "month":
			return getLabelForMonth(date.getMonth());
		case "year":
			return date.getFullYear();
	}
};

volume.methods._getTS = function(y, m, d, h, min) {
	var date = y ? new Date(y, m || 0, d || 1, h || 0, min || 0, 0, 0) : new Date();
	return Math.round(date.getTime() / 1000);
};

volume.methods._getPeriodResolutionType = function(entries) {
	var date = new Date(),
		year = date.getFullYear(),
		month = date.getMonth(),
		day = date.getDate(),
		hours = date.getHours(),
		mins = date.getMinutes();

	var avg = entries.length
		? (this._getTS() - entries[entries.length - 1].timestamp) / 2
		: 0;

	if (avg < 60 * 60) {
		return {
			"type": "min",
			"interval": 60,
			"start": this._getTS(year, month, day, hours, mins)
		};
	}
	if (avg < 60 * 60 * 24) {
		return {
			"type": "hour",
			"interval": 60 * 60,
			"start": this._getTS(year, month, day, hours)
		};
	}
	if (avg < 60 * 60 * 24 * 7) {
		return {
			"type": "day",
			"interval": 60 * 60 * 24,
			"start": this._getTS(year, month, day)
		};
	}
	if (avg < 60 * 60 * 24 * 365) {
		return {
			"type": "month",
			"interval": 60 * 60 * 24 * 30,
			"start": this._getTS(year, month)
		};
	}
	return {
		"type": "year",
		"interval": 60 * 60 * 24 * 365,
		"start": this._getTS(year)
	};
};

volume.methods._createPeriods = function() {
	var limit = this.config.get("presentation.maxIntervals");
	var period = this.get("period");
	for (var i = 0; i < limit; i++) {
		this._createPeriod(period.start - i * period.interval, 0);
	}
};

volume.methods._createPeriod = function(start, count, action, updateChart) {
	var chart = this.get("chart");
	var period = {
		"start": start,
		"count": count || 0,
		"label": this._getTimestampTranslation(start)
	};
	this.get("periods")[action || "unshift"](period);
	if (updateChart && chart) {
		chart.addData([count], period.label);
		if (this.get("periods").length > this.config.get("presentation.maxIntervals")) {
			this.get("periods").shift();
			chart.removeData();
		}
	}
	return period;
};

volume.methods._isWithinPeriod = function(entry, period) {
	return (entry.timestamp > period.start) &&
		(entry.timestamp <= period.start + this.get("period.interval"));
};

volume.methods._assembleQuery = function() {
	var query = "scope:{config:targetURL} sortOrder:reverseChronological " +
		"itemsPerPage:{config:maxItemsToRetrieve} children:0";
	return this.substitute({"template": query});
};

volume.methods._getRequestObject = function() {
	var ssConfig = this.config.get("dependencies.StreamServer");
	return Echo.StreamServer.API.request({
		"endpoint": "search",
		"apiBaseURL": ssConfig.apiBaseURL,
		"data": {
			"q": this._assembleQuery(),
			"appkey": ssConfig.appkey
		},
		"liveUpdates": $.extend(ssConfig.liveUpdates, {
			"onData": this._getHandlerFor("onUpdate")
		}),
		"onError": this._getHandlerFor("onError"),
		"onData": this._getHandlerFor("onData")
	});
};

// the goal of this function is to make sure that we add
// periods to graphs as needed even in case we do not receive
// items via live updates
volume.methods._createPeriodWatcher = function() {
	var app = this;
	var timeout;
	var getLastPeriodStart = function() {
		return app.get("periods")[app.get("periods").length - 1].start;
	};
	var start = function() {
		var interval = app.get("period.interval");
		var nextPeriodStart = getLastPeriodStart() + interval;
		var delta = nextPeriodStart - Math.round((new Date()).getTime() / 1000);
		var checkTimeout = delta > 0 ? delta : interval;
		timeout = setTimeout(function() {
			if (getLastPeriodStart() !== nextPeriodStart) {
				app._createPeriod(nextPeriodStart, 0, "push", true);
			}
			start();
		}, checkTimeout * 1000);
	};
	return {
		"start": start,
		"stop": function() {
			clearTimeout(timeout);
		}
	};
};

// we prevent chart updates from super-fast calls in case of a huge
// new items flow, since chart update is quite CPU-intensive operation.
volume.methods._createUpdateWatcher = function() {
	var app = this, timeout;
	var stop = function() {
		clearTimeout(timeout);
		timeout = undefined;
	};
	var start = function() {
		if (timeout || !app.get("chart")) return;
		timeout = setTimeout(function() {
			if (app.get("visible")) {
				app.get("chart").update();
			}
			stop();
		}, app.config.get("chartUpdateDelay"));
	};
	return {"start": start, "stop": stop};
};

// maybe move to Echo.Utils later...
// inspired by http://www.html5rocks.com/en/tutorials/pagevisibility/intro/
volume.methods._createDocumentVisibilityWatcher = function() {
	var prefix, handler;

	// if "hidden" is natively supported just return it
	if ("hidden" in document) {
		prefix = ""; // non-prefixed, i.e. natively supported
	} else {
		var prefixes = ["webkit", "moz", "ms", "o"];
		for (var i = 0; i < prefixes.length; i++) {
			if ((prefixes[i] + "Hidden") in document) {
				prefix = prefixes[i] + "Hidden";
				break;
			}
		}
	}

	// we were unable to locate "hidden" property,
	// which means this functionality is not supported
	if (prefix === undefined) return;

	var eventName = prefix + "visibilitychange";
	return {
		"start": function(onShow, onHide) {
			handler = function() {
				document[prefix ? prefix + "Hidden" : "hidden"]
					? onHide()
					: onShow();
			};
			$(document).on(eventName, handler);
		},
		"stop": function() {
			$(document).off(eventName, handler);
		}
	};
};

volume.methods._getHandlerFor = function(name) {
	return $.proxy(this.handlers[name], this);
};

volume.methods.handlers = {};

volume.methods.handlers.onData = function(data) {
	// store initial data in the config as well,
	// so that we can access it later to refresh the graph
	if ($.isEmptyObject(this.config.get("data"))) {
		this.config.set("data", data);
	}

	var entries = this._normalizeEntries(data.entries);
	this.set("period", this._getPeriodResolutionType(entries));

	this._createPeriods();

	this.set("watchers.period", this._createPeriodWatcher());
	this.get("watchers.period").start();

	if (this._hasData()) {
		this._placeIntoPeriods(entries);
	}

	// get rid of empty periods
	// at the very beginning of the graph
	this._cleanupPeriods();

	this.render();

	// we init graph *only* after a target is placed into DOM,
	// Chart.js doesn't like elements detached from DOM structure...
	if (this._hasData()) {
		this.set("chart", this._initChart(this.view.get("graph")));
	}

	this.ready();
};

volume.methods.handlers.onUpdate = function(data) {
	var origEntries, hasData = this._hasData();
	if (data && data.entries) {
		origEntries = data.entries;
		// we keep 2x items to increase the chances of avoiding gaps
		// on the graph. StreamServer keeps 2x items in a cached view,
		// so we may later implement additional data fetching which will
		// result in 2x data increase on the client side, so 2x number is
		// future-proof
		var max = this.config.get("maxItemsToRetrieve") * 2;
		var entries = this.config.get("data.entries", []);
		data.entries = data.entries.concat(entries).slice(0, max);
		this.config.set("data", data);
	}
	if (this.get("visible")) {
		if (!hasData && origEntries && origEntries.length) {
			this.render();
			this.set("chart", this._initChart(this.view.get("graph")));
		}
		this._placeIntoPeriods(this._normalizeEntries(origEntries), true);
	}
};

volume.methods.handlers.onError = function(data, options) {
	var isCriticalError =
		typeof options.critical === "undefined" ||
		options.critical && options.requestType === "initial";

	if (isCriticalError) {
		this.showError(data, $.extend(options, {
			"request": this.request
		}));
	}
};

volume.css =
	'.{class:container} { margin: 0px auto; }' +
	'.{class:subcontainer} { margin: 10px 15px 5px 0px; }' +
	'.{class:graph} { width: 100%; }' +
	'.{class:empty} { border: 1px solid #d2d2d2; background-color: #fff; margin: 0px; margin-bottom: 10px; padding: 30px 20px; text-align: center; }' +
	'.{class:empty} .{class:message} { background: url("//cdn.echoenabled.com/apps/echo/conversations/v2/sdk-derived/images/info.png") no-repeat; margin: 0 auto; font-size: 14px; font-family: "Helvetica Neue", Helvetica, "Open Sans", sans-serif; padding-left: 40px; display: inline-block; text-align: left; line-height: 16px; color: #7f7f7f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; box-sizing: border-box; }';

Echo.App.create(volume);

})(Echo.jQuery);
