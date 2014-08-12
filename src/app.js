(function($) {
"use strict";

var volume = Echo.App.manifest("Echo.Apps.VolumeOverTime");

if (Echo.App.isDefined(volume)) return;

volume.vars = {
	"timer": undefined,
	"chart": undefined,
	"period": undefined,
	"periods": [],
	"months": [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec"
	]
};

volume.config = {
	"targetURL": undefined,
	// amount of items to retrieve from StreamServer
	// 100 is the limitation on the amount of root items
	"maxItemsToRetrieve": 100,
	"presentation": {
		"visualization": "bar", // or "line"
		"maxIntervals": 10,
		"maxWidth": 700, // in px
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
			"apiBaseURL": "{%= apiBaseURLs.StreamServer.basic %}",
			"liveUpdates": {
				"transport": "websockets",
				"enabled": true,
				"websockets": {
					"URL": "{%= apiBaseURLs.StreamServer.ws %}"
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

	app._requestData({
		"onData": function(data) {
			var entries = app._normalizeEntries(data.entries);
			app.set("period", app._getPeriodResolutionType(entries));

			app._createPeriods();
			app._setupPeriodsWatcher();
			app._placeIntoPeriods(entries);

			app.render();

			// we init graph *only* after a target is placed into DOM,
			// Chart.js doesn't like elements detached from DOM structure...
			app.set("chart", app._initChart(app.view.get("graph")));

			app.ready();
		},
		"onUpdate": function(data) {
			app._placeIntoPeriods(app._normalizeEntries(data.entries), true);
		},
		"onError": function(data, options) {
			var isCriticalError =
				typeof options.critical === "undefined" ||
				options.critical && options.requestType === "initial";

			if (isCriticalError) {
				app.showError(data, $.extend(options, {
					"request": app.request
				}));
			}
		}
	});
};

volume.destroy = function() {
	var timer = this.get("timer");
	if (timer) {
		clearTimeout(timer);
		this.remove("timer");
	}
};

volume.templates.main =
	'<div class="{class:container}">' +
		'<canvas class="{class:graph}"></canvas>' +
	'</div>';

volume.renderers.container = function(element) {
	element.css({"max-width": parseInt(this.config.get("presentation.maxWidth") + "px")});
	return element;
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
						chart.update();
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
	var maxIntervals = this.config.get("presentation.maxIntervals");
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
			"limit": maxIntervals,
			"interval": 60,
			"start": this._getTS(year, month, day, hours, mins)
		};
	}
	if (avg < 60 * 60 * 24) {
		return {
			"type": "hour",
			"limit": maxIntervals,
			"interval": 60 * 60,
			"start": this._getTS(year, month, day, hours)
		};
	}
	if (avg < 60 * 60 * 24 * 7) {
		return {
			"type": "day",
			"limit": maxIntervals,
			"interval": 60 * 60 * 24,
			"start": this._getTS(year, month, day)
		};
	}
	if (avg < 60 * 60 * 24 * 365) {
		return {
			"type": "month",
			"limit": maxIntervals,
			"interval": 60 * 60 * 24 * 30,
			"start": this._getTS(year, month)
		};
	}
	return {
		"type": "year",
		"limit": 3, // show 3 last years, no need to display more
		"interval": 60 * 60 * 24 * 365,
		"start": this._getTS(year)
	};
};

// the goal of this function is to make sure that we add
// periods to graphs as needed even in case we do not receive
// items via live updates
volume.methods._setupPeriodsWatcher = function() {
	var app = this;
	var getLastPeriodStart = function() {
		return app.get("periods")[app.get("periods").length - 1].start;
	};
	var nextPeriodStart = getLastPeriodStart() + this.get("period.interval");
	var delta = nextPeriodStart - Math.round((new Date()).getTime() / 1000);
	var checkTimeout = delta > 0 ? delta : this.get("period.interval");
	var timeout = setTimeout(function() {
		if (getLastPeriodStart() !== nextPeriodStart) {
			app._createPeriod(nextPeriodStart, 0, "push", true);
		}
		app._setupPeriodsWatcher();
	}, checkTimeout * 1000);
	this.set("timeout", timeout);
};

volume.methods._createPeriods = function() {
	var period = this.get("period");
	for (var i = 0; i < period.limit; i++) {
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

volume.methods._requestData = function(handlers) {
	var ssConfig = this.config.get("dependencies.StreamServer");
	// keep a reference to a request object in "this" to trigger its
	// automatic sweeping out on Echo.Control level at app destory time
	this.request = Echo.StreamServer.API.request({
		"endpoint": "search",
		"apiBaseURL": ssConfig.apiBaseURL,
		"data": {
			"q": this._assembleQuery(),
			"appkey": ssConfig.appkey
		},
		"liveUpdates": $.extend(ssConfig.liveUpdates, {
			"onData": handlers.onUpdate
		}),
		"onError": handlers.onError,
		"onData": handlers.onData
	});
	this.request.send();
};

volume.css =
	'.{class:container} { margin: 0px auto; }' +
	'.{class:graph} { width: 100%; }';

Echo.App.create(volume);

})(Echo.jQuery);
