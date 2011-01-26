// $.ajax({url: 'http://http://localhost:28017/serverStatus', success: function(d){console.log(arguments);}, error: function(d){console.log('error'); console.log(arguments);}})
$(function(){
    var fixResponse = function(resp){
        console.log('Fix response');
        var r = /(Date\( (\d+) \))/g;
        var matches = resp.match(r);
        var timestamp = matches[matches.length-1];
        var newTime = new Date();
        newTime.setTime(timestamp);
        return resp.replace(r, '"'+newTime.toString()+'"');
    };

    var defaultMetrics = [
        {label: 'Queries', group: 'opcounters', identity: 'query'},
        {label: 'Inserts', group: 'opcounters', identity: 'insert'},
        {label: 'Updates', group: 'opcounters', identity: 'update'},
        {label: 'Deletes', group: 'opcounters', identity: 'delete'},
        {label: 'Commands', group: 'opcounters', identity: 'command'},
        {label: 'Getmores', group: 'opcounters', identity: 'getmore'},
        {label: 'Hits', group: 'indexCounters', identity: 'btree.hits'},
        {label: 'Misses', group: 'indexCounters', identity: 'btree.misses'}
    ];

    var Metric = Backbone.Model.extend({
        defaults: {
            'label': 'A Metric', 
            'group': 'opcounters',
            'name': 'query',
            'value': 0
        },
        toString: function(){
            return "Metric({label: '"+this.get('label')+"', value: '"+this.get('value')+"'})";
        }
    });

    var MetricList = Backbone.Collection.extend({
        model: Metric
    });

    var Server = Backbone.Model.extend({
        defaults: {
            'host': 'localhost',
            'port': 28017,
            'metrics': new MetricList,
            'name': 'Mongo HANGRY!',
            'pollRate': 10000
        },
        initialize: function(){
            _.bindAll(this, '_onUpdateSuccess', '_onUpdateError', 'setStatusUrl', 'updateMetrics');
            
            // Setup the URL to get server status from and update it on change.
            this.bind('change:host', this.setStatusUrl);
            this.bind('change:port', this.setStatusUrl);
            this.setStatusUrl();

            // Add our default metrics
            var server = this;
            this.set({'metrics': new MetricList});
            _.each(defaultMetrics, function(m){
                server.get('metrics').add(new Metric(m));
            });
        },
        // Called on initialize or when the host or port is changed.
        setStatusUrl: function(){
            this.set({'statusUrl': 'http://'+this.get('host')+':'+this.get('port')+'/serverStatus'});  
        },
        // Set an interval to call update status every Server#pollInterval
        // milliseconds.  
        startPolling: function(){
            console.log('Start polling called');
            this.updateMetrics();
            this.pollInterval = setInterval(this.updateMetrics, 5000);
        },
        // Convenience for testing really to stop the updater interval.
        stopPolling: function(){
            clearInterval(this.pollInterval);
        },
        // Fetch the JSON from the server's status URL and update the metric
        // models we're interested in.
        updateMetrics: function(){
            $.ajax({url: this.get('statusUrl'), dataType: 'html', success: this._onUpdateSuccess, error: this._onUpdateError});
        },
        // On successful server status call, upate the model value's of all the 
        // metrics we're interested in.
        _onUpdateSuccess: function(data){
            var response = fixResponse(data);
            var stats = JSON.parse(response);
            console.log(stats);
            var server = this;
            var cache = {};
            this.get('metrics').each(function(metric){
                var val;
                if(metric.get('name').indexOf('.') > -1){
                    p = metric.get('name').split('.');
                    console.log(p);
                    val = stats[metric.get('group')][p[0]][p[1]];
                }
                else{
                    val = stats[metric.get('group')][metric.get('name')];
                }
                console.log('Set metric '+metric+' on server '+server+' to '+val);
                metric.set({'value': val});
            });
        },
        // If there is some error fetching server status (ie incorrect host, 
        // port, or GASP the server is messed up).
        // @todo (lucas) Show errors in the display somewhere.
        _onUpdateError: function(){
            console.error('Error updating stats for '+this);
            console.error(arguments);
        },
        toString: function(){
            return "Server({name: '"+this.get('name')+"', statusUrl: '"+this.get('statusUrl')+"'})"
        }
    });

    var ServerView = Backbone.View.extend({
        tagname: 'div',
        className: 'server',
        template: _.template($('#server-template').html()),
        initialize: function(){
            this.model.bind('change', this.render);
            this.model.view = this;
        },
        render: function(){
            $(this.el).html('');
            $(this.el).html(this.template(this.model.toJSON()));
            var metricsEl = $(this.el).find('.metrics');

            this.model.get('metrics').each(function(metric, i){
                var lp = (i == 0) ? 'left' : (i % 2) ? 'right': 'left';
                var view = new MetricChartView({model: metric, labelPlacement: lp});
                var el = view.render().el;
                console.log(metric.cid);
                

                if(lp=='left'){
                    metricsEl.append(el);
                    $(el).wrap('<div class="metricRow" />');
                }
                else{

                    metricsEl.find('.metricRow:last').append(el);
                    metricsEl.find('.metricRow:last').append('<br style="clear: both;" />');
                }
                metric.chart = view.chart;
                $(el).find('.chart canvas').attr('id', metric.cid);
            });
            

            $('#mainContainer').append($(this.el));
            this.model.get('metrics').each(function(metric){
                metric.chart.streamTo(document.getElementById(metric.cid));
            });
            return this;
        }
    });

    // A chart for an individual server metric.
    var MetricChartView = Backbone.View.extend({
        // Style options to pass to smoothie when creating the new chart.
        chartOptions: { millisPerPixel: 20, grid: { strokeStyle: '#555555', fillStyle: '#402817',  lineWidth: 1, millisPerLine: 1000, verticalSections: 4 }},

        // Style options to pass to smoothie when we first add our series to
        // the chart.
        seriesOptions: { strokeStyle: 'rgba(102, 204, 102, 1)', fillStyle: 'rgba(102, 204, 102, 0.2)', lineWidth: 3 },
        
        // Tag to use for the element of this view.
        tagname: 'div',

        // CSS class name to give the element of this view.
        className: 'metricChart',

        // Canvas element we'll draw our chart into.
        canvasTeplate: _.template('<div class="chart"><canvas width="300" height="120"></canvas></div>'),
        
        // Label element for the chart.
        labelTemplate: _.template('<div class="chartName"><%= label %></div>'),

        initialize: function(opts){
            this.streamSpeed = opts.streamSpeed || 1000;
            this.labelPlacement = opts.labelPlacement || 'left';
            this.model.set({'lastValue': this.model.get('value')});

            _.bindAll(this, '_valueChanged');
            //this.model.bind('change:value', this._valueChanged);
            setInterval(this._valueChanged, 1000);

            this.series = new TimeSeries();
            this.chart = new SmoothieChart(this.chartOptions);
            this.chart.addTimeSeries(this.series, this.seriesOptions);
        },
        // When the value of a :Metric is changed, we want to update our 
        // graph's series.
        _valueChanged: function(metric, value){
            console.log('Value changed for metric '+this.model);
            console.log('Previous: '+this.model.previous('value'));
            console.log('Current: '+this.model.get('value'));
            
            var x = (new Date()).getTime(), y = 0;
            var previous = this.model.get('previousValue'), current = this.model.get('value');
            if (current > previous) {
                y = current - previous;
            }
            this.model.set({'previousValue': this.model.get('value')});
            this.series.append(x, y);
            console.log(this.chart);
        },
        // Render the chart HTML and start streaming our series to it.
        render: function(){
            var chartHtml = _.template('<div class="chart"><canvas width="300" height="120"></canvas></div>', this.model.toJSON());
            var labelHtml = _.template('<div class="chartName"><%= label %></div>', this.model.toJSON());
            $(this.el).addClass(this.labelPlacement);
            $(this.el).append(chartHtml);
            $(this.el).prepend(labelHtml);
            return this;
        }
    });

    window.server = new Server();
    serverView = new ServerView({model: window.server});
    serverView.render();
});