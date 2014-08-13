(function($) {
"use strict";

if (Echo.AppServer.Dashboard.isDefined("Echo.Apps.VolumeOverTime.Dashboard")) return;

var dashboard = Echo.AppServer.Dashboard.manifest("Echo.Apps.VolumeOverTime.Dashboard");

dashboard.inherits = Echo.Utils.getComponent("Echo.AppServer.Dashboards.AppSettings");

dashboard.labels = {
	"failedToFetchToken": "Failed to fetch customer DataServer token: {reason}"
};

dashboard.mappings = {
	"dependencies.appkey": {
		"key": "dependencies.StreamServer.appkey"
	}
};

dashboard.dependencies = [{
	"url": "{config:cdnBaseURL.apps.appserver}/controls/configurator.js",
	"control": "Echo.AppServer.Controls.Configurator"
}, {
	"url": "{config:cdnBaseURL.apps.dataserver}/full.pack.js",
	"control": "Echo.DataServer.Controls.Pack"
}];

dashboard.config = {
	"appkeys": []
};

dashboard.config.ecl = [{
	"name": "targetURL",
	"component": "Echo.DataServer.Controls.Dashboard.DataSourceGroup",
	"type": "string",
	"required": true,
	"config": {
		"title": "",
		"labels": {
			"dataserverBundleName": "Echo Historical Volume Auto-Generated Bundle for {instanceName}"
		},
		"apiBaseURLs": {
			"DataServer": "{%= apiBaseURLs.DataServer %}"
		}
	}
}, {
	"component": "Group",
	"name": "presentation",
	"type": "object",
	"config": {
		"title": "Presentation"
	},
	"items": [{
		"component": "Select",
		"name": "visualization",
		"type": "string",
		"default": "bar",
		"config": {
			"title": "Chart style",
			"desc": "Specifies the chart type to be used",
			"options": [{
				"title": "Bar Chart",
				"value": "bar"
			}, {
				"title": "Line Chart",
				"value": "line"
			}]
		}
	}, {
		"component": "Input",
		"name": "maxIntervals",
		"type": "number",
		"default": 10,
		"config": {
			"title": "Maximum slices",
			"desc": "Specifies a maximum number of time slices for the chart"
		}
	}, {
	"component": "Input",
		"name": "maxWidth",
		"type": "number",
		"default": 700,
		"config": {
			"title": "Maximum width",
			"desc": "Specifies a maximum width (in pixels) of an App container",
			"data": {"sample": 700}
		}
	}, {
		"component": "Input",
		"name": "fillColor",
		"type": "string",
		"config": {
			"title": "Fill color",
			"desc": "Specifies the primary fill color of the chart",
			"data": {"sample": "#D8D8D8"}
		}
	}, {
		"component": "Input",
		"name": "strokeColor",
		"type": "string",
		"config": {
			"title": "Stroke color",
			"desc": "Specifies border color/line color of the chart",
			"data": {"sample": "#C0C0C0"}
		}
	}, {
		"component": "Input",
		"name": "highlightFill",
		"type": "string",
		"config": {
			"title": "Hover fill color",
			"desc": "Specifies primary fill color of the chart when mouse is hovering over it (for Bar Chart only)",
			"data": {"sample": "#C0C0C0"}
		}
	}, {
		"component": "Input",
		"name": "highlightStroke",
		"type": "string",
		"config": {
			"title": "Hover stroke color",
			"desc": "Specifies stroke color of the chart when mouse is hovering over it (for Bar Chart only)",
			"data": {"sample": "#C0C0C0"}
		}
	}]
}, {
	"component": "Group",
	"name": "dependencies",
	"type": "object",
	"config": {
		"title": "Dependencies"
	},
	"items": [{
		"component": "Select",
		"name": "appkey",
		"type": "string",
		"config": {
			"title": "StreamServer application key",
			"desc": "Specifies the application key for this instance",
			"options": []
		}
	}]
}];

dashboard.init = function() {
	var self = this, parent = $.proxy(this.parent, this);
	this._fetchDataServerToken(function() {
		self._requestData(function() {
			self.config.set("ecl", self._prepareECL(self.config.get("ecl")));
			parent();
		});
	});
};

dashboard.methods.declareInitialConfig = function() {
	var keys = this.get("appkeys", []);
	return {
		"targetURL": this._assembleTargetURL(),
		"dependencies": {
			"StreamServer": {
				"appkey": keys.length ? keys[0].key : undefined
			}
		}
	};
};

dashboard.methods._requestData = function(callback) {
	var self = this;
	var customerId = this.config.get("data.customer.id");
	var deferreds = [];
	var request = this.config.get("request");

	var requests = [{
		"name": "appkeys",
		"endpoint": "customer/" + customerId + "/appkeys"
	}, {
		"name": "domains",
		"endpoint": "customer/" + customerId + "/domains"
	}];
	$.map(requests, function(req) {
		var deferredId = deferreds.push($.Deferred()) - 1;
		request({
			"endpoint": req.endpoint,
			"success": function(response) {
				self.set(req.name, response);
				deferreds[deferredId].resolve();
			}
		});
	});
	$.when.apply($, deferreds).done(callback);
};

dashboard.methods._prepareECL = function(items) {
	var self = this;

	var instructions = {
		"targetURL": function(item) {
			item.config = $.extend({
				"instanceName": self.get("data.instance.name"),
				"domains": self.get("domains"),
				"apiToken": self.config.get("dataserverToken"),
				"valueHandler": function() {
					return self._assembleTargetURL();
				}
			}, item.config);
			return item;
		},
		"dependencies.appkey": function(item) {
			item.config.options = $.map(self.get("appkeys"), function(appkey) {
				return {
					"title": appkey.key,
					"value": appkey.key
				};
			});
			return item;
		}
	};
	return (function traverse(items, path) {
		return $.map(items, function(item) {
			var _path = path ? path + "." + item.name : item.name;
			if (item.type === "object" && item.items) {
				item.items = traverse(item.items, _path);
			} else if (instructions[_path]) {
				item = instructions[_path](item);
			}
			return item;
		});
	})(items, "");
};

dashboard.methods._fetchDataServerToken = function(callback) {
	var self = this;
	Echo.AppServer.API.request({
		"endpoint": "customer/{id}/subscriptions",
		"id": this.get("data.customer").id,
		"onData": function(response) {
			var token = Echo.Utils.foldl("", response, function(subscription, acc) {
				return subscription.product.name === "dataserver"
					? subscription.extra.token
					: acc;
			});
			if (token) {
				self.config.set("dataserverToken", token);
				callback.call(self);
			} else {
				self._displayError(
					self.labels.get("failedToFetchToken", {
						"reason": self.labels.get("dataserverSubscriptionNotFound")
					})
				);
			}
		},
		"onError": function(response) {
			self._displayError(self.labels.get("failedToFetchToken", {"reason": response.data.msg}));
		}
	}).send();
};

dashboard.methods._displayError = function(message) {
	this.showMessage({
		"type": "error",
		"message": message,
		"target": this.config.get("target")
	});
	this.ready();
};

dashboard.methods._assembleTargetURL = function() {
	var re = new RegExp("\/" + this.get("data.instance.name") + "$");
	var targetURL = this.get("data.instance.config.targetURL");

	if (!targetURL || !targetURL.match(re)) {
		targetURL = "http://" + this.get("domains")[0] + "/social-source-input/" + this.get("data.instance.name");
	}

	return targetURL;
};

Echo.AppServer.Dashboard.create(dashboard);

})(Echo.jQuery);
