(function($) {
"use strict";

if (Echo.AppServer.Dashboard.isDefined("Echo.Apps.VolumeOverTime.Dashboard")) return;

var dashboard = Echo.AppServer.Dashboard.manifest("Echo.Apps.VolumeOverTime.Dashboard");

dashboard.inherits = Echo.Utils.getComponent("Echo.AppServer.Dashboards.AppSettings");

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
}, {
	"url": "//cdn.echoenabled.com/apps/echo/social-map/v1/slider.js"
}, {
	"url": "//cdn.echoenabled.com/apps/echo/social-map/v1/colorpicker.js"
}];

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
			"DataServer": "{%= apiBaseURLs.DataServer %}/"
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
		"component": "Slider",
		"name": "maxIntervals",
		"type": "number",
		"default": 10,
		"config": {
			"title": "Maximum slices",
			"desc": "Specifies a maximum number of time slices for the chart",
			"min": 3,
			"max": 15,
			"step": 1,
			"unit": "pcs"
		}
	}, {
		"component": "Colorpicker",
		"name": "fillColor",
		"type": "string",
		"default": "#D8D8D8",
		"config": {
			"title": "Fill color",
			"desc": "Specifies the primary fill color of the chart",
			"data": {"sample": "#D8D8D8"}
		}
	}, {
		"component": "Colorpicker",
		"name": "strokeColor",
		"type": "string",
		"default": "#C0C0C0",
		"config": {
			"title": "Stroke color",
			"desc": "Specifies border color/line color of the chart",
			"data": {"sample": "#C0C0C0"}
		}
	}, {
		"component": "Colorpicker",
		"name": "highlightFill",
		"type": "string",
		"default": "#C0C0C0",
		"config": {
			"title": "Hover fill color",
			"desc": "Specifies primary fill color of the chart when mouse is hovering over it (for Bar Chart only)",
			"data": {"sample": "#C0C0C0"}
		}
	}, {
		"component": "Colorpicker",
		"name": "highlightStroke",
		"type": "string",
		"default": "#C0C0C0",
		"config": {
			"title": "Hover stroke color",
			"desc": "Specifies stroke color of the chart when mouse is hovering over it (for Bar Chart only)",
			"data": {"sample": "#C0C0C0"}
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
	}]
}, {
	"component": "Group",
	"name": "dependencies",
	"type": "object",
	"config": {
		"title": "Dependencies",
		"expanded": false
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

dashboard.modifiers = {
	"dependencies.appkey": {
		"endpoint": "customer/{self:user.getCustomerId}/appkeys",
		"processor": function() {
			return this.getAppkey.apply(this, arguments);
		}
	},
	"targetURL": {
		"endpoint": "customer/{self:user.getCustomerId}/subscriptions",
		"processor": function() {
			return this.getBundleTargetURL.apply(this, arguments);
		}
	}
};

dashboard.init = function() {
	this.parent();
};

dashboard.methods.declareInitialConfig = function() {
	return {
		"targetURL": this.assembleTargetURL(),
		"dependencies": {
			"StreamServer": {
				"appkey": this.getDefaultAppKey()
			}
		}
	};
};

Echo.AppServer.Dashboard.create(dashboard);

})(Echo.jQuery);
