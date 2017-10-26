import React from 'react'

import moment from 'moment'
import * as d3 from 'd3'

class CalendarHeatmap extends React.Component {

  constructor(props) {
    super(props)

    this.settings = {
      gutter: 5,
      item_gutter: 1,
      width: 1000,
      height: 200,
      item_size: 10,
      label_padding: 40,
      max_block_height: 20,
      transition_duration: 500,
      tooltip_width: 250,
      tooltip_padding: 15,
    }

    this.in_transition = false
    this.history = ['global']
    this.selected = {}

    this.calcDimensions = this.calcDimensions.bind(this)
  }

  componentDidMount() {
    this.createElements()
    this.parseData()
    this.drawChart()

    window.addEventListener('resize', this.calcDimensions)
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.calcDimensions)
  }

  createElements() {
    // Create svg element
    this.svg = d3.select('#calendar-heatmap')
      .append('svg')
      .attr('class', 'svg')

    // Create other svg elements
    this.items = svg.append('g')
    this.labels = svg.append('g')
    this.buttons = svg.append('g')

    // Add tooltip to the same element as main svg
    this.tooltip = d3.select('#calendar-heatmap')
      .append('div')
      .attr('class', 'heatmap-tooltip')
      .style('opacity', 0)

    this.calcDimensions()
  }

  // Calculate dimensions based on available width
  calcDimensions() {
    var dayIndex = Math.round((moment() - moment().subtract(1, 'year').startOf('week')) / 86400000)
    var colIndex = Math.trunc(dayIndex / 7)
    var numWeeks = colIndex + 1

    this.settings.width = container.offsetWidth < 1000 ? 1000 : container.offsetWidth
    this.settings.item_size = ((this.settings.width - this.settings.label_padding) / numWeeks - this.settings.gutter)
    this.settings.height = this.settings.label_padding + 7 * (this.settings.item_size + this.settings.gutter)
    this.attr('width', this.settings.width)
      .attr('height', this.settings.height)

    if ( !!this.props.data && !!this.props.data[0].summary ) {
      this.drawChart()
    }
  }

  parseData() {
    if ( !this.props.data ) { return }

    // Get daily summary if that was not provided
    if ( !this.props.data[0].summary ) {
      this.props.data.map(function(d) {
        var summary = d.details.reduce(function(uniques, project) {
          if (!uniques[project.name]) {
            uniques[project.name] = {
              'value': project.value
            }
          } else {
            uniques[project.name].value += project.value
          }
          return uniques
        }, {})
        var unsorted_summary = Object.keys(summary).map(function(key) {
          return {
            'name': key,
            'value': summary[key].value
          }
        })
        d.summary = unsorted_summary.sort(function(a, b) {
          return b.value - a.value
        })
        return d
      })
    }
  }

  drawChart() {
    if ( this.overview === 'global' ) {
      this.drawGlobalOverview()
    } else if ( this.overview === 'year' ) {
      this.drawYearOverview()
    } else if ( this.overview === 'month' ) {
      this.drawMonthOverview()
    } else if ( this.overview === 'week' ) {
      this.drawWeekOverview()
    } else if ( this.overview === 'day' ) {
      this.drawDayOverview()
    }
  }


  /**
   * Draw global overview (multiple years)
   */
  drawGlobalOverview() {

    // Add current overview to the history
    if (this.history[this.history.length - 1] !== this.overview) {
      this.history.push(this.overview)
    }

    // Define start and end of the dataset
    var start = moment(this.props.data[0].date).startOf('year')
    var end = moment(this.props.data[this.props.data.length - 1].date).endOf('year')

    // Define array of years and total values
    var year_data = d3.timeYears(start, end).map(function(d) {
      var date = moment(d)
      return {
        'date': date,
        'total': this.props.data.reduce(function(prev, current) {
          if (moment(current.date).year() === date.year()) {
            prev += current.total
          }
          return prev
        }, 0),
        'summary': function() {
          var summary = this.props.data.reduce(function(summary, d) {
            if (moment(d.date).year() === date.year()) {
              for (var i = 0; i < d.summary.length; i++) {
                if (!summary[d.summary[i].name]) {
                  summary[d.summary[i].name] = {
                    'value': d.summary[i].value,
                  }
                } else {
                  summary[d.summary[i].name].value += d.summary[i].value
                }
              }
            }
            return summary
          }, {})
          var unsorted_summary = Object.keys(summary).map(function(key) {
            return {
              'name': key,
              'value': summary[key].value
            }
          })
          return unsorted_summary.sort(function(a, b) {
            return b.value - a.value
          })
        }(),
      }
    })

    // Calculate max value of all the years in the dataset
    var max_value = d3.max(year_data, function(d) {
      return d.total
    })

    // Define year labels and axis
    var year_labels = d3.timeYears(start, end).map(function(d) {
      return moment(d)
    })
    var yearScale = d3.scaleBand()
      .rangeRound([0, this.settings.width])
      .padding([0.05])
      .domain(year_labels.map(function(d) {
        return d.year()
      }))

    // Add month data items to the overview
    this.items.selectAll('.item-block-year').remove()
    var item_block = this.items.selectAll('.item-block-year')
      .data(year_data)
      .enter()
      .append('rect')
      .attr('class', 'item item-block-year')
      .attr('width', function() {
        return (this.settings.width - this.settings.label_padding) / year_labels.length - this.settings.gutter * 5
      })
      .attr('height', function() {
        return this.settings.height - this.settings.label_padding
      })
      .attr('transform', function(d) {
        return 'translate(' + yearScale(d.date.year()) + ',' + this.settings.tooltip_padding * 2 + ')'
      })
      .attr('fill', function(d) {
        var color = d3.scaleLinear()
          .range(['#ffffff', this.props.color])
          .domain([-0.15 * max_value, max_value])
        return color(d.total) || '#ff4500'
      })
      .on('click', function(d) {
        if (this.in_transition) { return }

        // Set in_transition flag
        this.in_transition = true

        // Set selected date to the one clicked on
        this.selected = d

        // Hide tooltip
        this.hideTooltip()

        // Remove all month overview related items and labels
        this.removeGlobalOverview()

        // Redraw the chart
        this.overview = 'year'
        this.drawChart()
      })
      .style('opacity', 0)
      .on('mouseover', function(d) {
        if (this.in_transition) { return }

        // Construct tooltip
        var tooltip_html = ''
        tooltip_html += '<div><span><strong>Total time tracked:</strong></span>'

        var sec = parseInt(d.total, 10)
        var days = Math.floor(sec / 86400)
        if (days > 0) {
          tooltip_html += '<span>' + (days === 1 ? '1 day' : days + ' days') + '</span></div>'
        }
        var hours = Math.floor((sec - (days * 86400)) / 3600)
        if (hours > 0) {
          if (days > 0) {
            tooltip_html += '<div><span></span><span>' + (hours === 1 ? '1 hour' : hours + ' hours') + '</span></div>'
          } else {
            tooltip_html += '<span>' + (hours === 1 ? '1 hour' : hours + ' hours') + '</span></div>'
          }
        }
        var minutes = Math.floor((sec - (days * 86400) - (hours * 3600)) / 60)
        if (minutes > 0) {
          if (days > 0 || hours > 0) {
            tooltip_html += '<div><span></span><span>' + (minutes === 1 ? '1 minute' : minutes + ' minutes') + '</span></div>'
          } else {
            tooltip_html += '<span>' + (minutes === 1 ? '1 minute' : minutes + ' minutes') + '</span></div>'
          }
        }
        tooltip_html += '<br />'

        // Add summary to the tooltip
        if (d.summary.length <= 5) {
          for (var i = 0; i < d.summary.length; i++) {
            tooltip_html += '<div><span><strong>' + d.summary[i].name + '</strong></span>'
            tooltip_html += '<span>' + this.formatTime(d.summary[i].value) + '</span></div>'
          }
        } else {
          for (var i = 0; i < 5; i++) {
            tooltip_html += '<div><span><strong>' + d.summary[i].name + '</strong></span>'
            tooltip_html += '<span>' + this.formatTime(d.summary[i].value) + '</span></div>'
          }
          tooltip_html += '<br />'

          var other_projects_sum = 0
          for (var i = 5; i < d.summary.length; i++) {
            other_projects_sum = +d.summary[i].value
          }
          tooltip_html += '<div><span><strong>Other:</strong></span>'
          tooltip_html += '<span>' + this.formatTime(other_projects_sum) + '</span></div>'
        }

        // Calculate tooltip position
        var x = yearScale(d.date.year()) + this.settings.tooltip_padding * 2
        while (this.settings.width - x < (this.settings.tooltip_width + this.settings.tooltip_padding * 5)) {
          x -= 10
        }
        var y = this.settings.tooltip_padding * 3

        // Show tooltip
        this.tooltip.html(tooltip_html)
          .style('left', x + 'px')
          .style('top', y + 'px')
          .transition()
          .duration(this.settings.transition_duration / 2)
          .ease(d3.easeLinear)
          .style('opacity', 1)
      })
      .on('mouseout', function() {
        if (this.in_transition) { return }
        this.hideTooltip()
      })
      .transition()
      .delay(function(d, i) {
        return this.settings.transition_duration * (i + 1) / 10
      })
      .duration(function() {
        return this.settings.transition_duration
      })
      .ease(d3.easeLinear)
      .style('opacity', 1)
      .call(function(transition, callback) {
        if (transition.empty()) {
          callback()
        }
        var n = 0
        transition
          .each(function() {++n })
          .on('end', function() {
            if (!--n) {
              callback.apply(this, arguments)
            }
          })
      }, function() {
        this.in_transition = false
      })

    // Add year labels
    this.labels.selectAll('.label-year').remove()
    this.labels.selectAll('.label-year')
      .data(year_labels)
      .enter()
      .append('text')
      .attr('class', 'label label-year')
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px'
      })
      .text(function(d) {
        return d.year()
      })
      .attr('x', function(d) {
        return yearScale(d.year())
      })
      .attr('y', this.settings.label_padding / 2)
      .on('mouseenter', function(year_label) {
        if (this.in_transition) { return }

        this.items.selectAll('.item-block-year')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', function(d) {
            return (moment(d.date).year() === year_label.year()) ? 1 : 0.1
          })
      })
      .on('mouseout', function() {
        if (this.in_transition) { return }

        this.items.selectAll('.item-block-year')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', 1)
      })
      .on('click', function(d) {
        if (this.in_transition) { return }

        // Set in_transition flag
        this.in_transition = true

        // Set selected month to the one clicked on
        this.selected = d

        // Hide tooltip
        this.hideTooltip()

        // Remove all year overview related items and labels
        this.removeGlobalOverview()

        // Redraw the chart
        this.overview = 'year'
        this.drawChart()
      })
  }


  /**
   * Draw year overview
   */
  drawYearOverview() {
    // Add current overview to the history
    if (this.history[this.history.length - 1] !== this.overview) {
      this.history.push(this.overview);
    }

    // Define start and end date of the selected year
    var start_of_year = moment(this.selected.date).startOf('year');
    var end_of_year = moment(this.selected.date).endOf('year');

    // Filter data down to the selected year
    var year_data = this.props.data.filter(function(d) {
      return start_of_year <= moment(d.date) && moment(d.date) < end_of_year;
    });

    // Calculate max value of the year data
    var max_value = d3.max(year_data, function(d) {
      return d.total;
    });

    var color = d3.scaleLinear()
      .range(['#ffffff', this.props.color])
      .domain([-0.15 * max_value, max_value]);

    var calcItemX = function(d) {
      var date = moment(d.date);
      var dayIndex = Math.round((date - moment(start_of_year).startOf('week')) / 86400000);
      var colIndex = Math.trunc(dayIndex / 7);
      return colIndex * (this.settings.item_size + this.settings.gutter) + this.settings.label_padding;
    };
    var calcItemY = function(d) {
      return this.settings.label_padding + moment(d.date).weekday() * (this.settings.item_size + this.settings.gutter);
    };
    var calcItemSize = function(d) {
      if (max_value <= 0) { return this.settings.item_size; }
      return this.settings.item_size * 0.75 + (this.settings.item_size * d.total / max_value) * 0.25;
    };

    this.items.selectAll('.item-circle').remove();
    this.items.selectAll('.item-circle')
      .data(year_data)
      .enter()
      .append('rect')
      .attr('class', 'item item-circle')
      .style('opacity', 0)
      .attr('x', function(d) {
        return calcItemX(d) + (this.settings.item_size - calcItemSize(d)) / 2;
      })
      .attr('y', function(d) {
        return calcItemY(d) + (this.settings.item_size - calcItemSize(d)) / 2;
      })
      .attr('rx', function(d) {
        return calcItemSize(d);
      })
      .attr('ry', function(d) {
        return calcItemSize(d);
      })
      .attr('width', function(d) {
        return calcItemSize(d);
      })
      .attr('height', function(d) {
        return calcItemSize(d);
      })
      .attr('fill', function(d) {
        return (d.total > 0) ? color(d.total) : 'transparent';
      })
      .on('click', function(d) {
        if (this.in_transition) { return; }

        // Don't transition if there is no data to show
        if (d.total === 0) { return; }

        this.in_transition = true;

        // Set selected date to the one clicked on
        this.selected = d;

        // Hide tooltip
        this.hideTooltip();

        // Remove all year overview related items and labels
        this.removeYearOverview();

        // Redraw the chart
        this.overview = 'day';
        this.drawChart();
      })
      .on('mouseover', function(d) {
        if (this.in_transition) { return; }

        // Pulsating animation
        var circle = d3.select(this);
        (function repeat() {
          circle = circle.transition()
            .duration(this.settings.transition_duration)
            .ease(d3.easeLinear)
            .attr('x', function(d) {
              return calcItemX(d) - (this.settings.item_size * 1.1 - this.settings.item_size) / 2;
            })
            .attr('y', function(d) {
              return calcItemY(d) - (this.settings.item_size * 1.1 - this.settings.item_size) / 2;
            })
            .attr('width', this.settings.item_size * 1.1)
            .attr('height', this.settings.item_size * 1.1)
            .transition()
            .duration(this.settings.transition_duration)
            .ease(d3.easeLinear)
            .attr('x', function(d) {
              return calcItemX(d) + (this.settings.item_size - calcItemSize(d)) / 2;
            })
            .attr('y', function(d) {
              return calcItemY(d) + (this.settings.item_size - calcItemSize(d)) / 2;
            })
            .attr('width', function(d) {
              return calcItemSize(d);
            })
            .attr('height', function(d) {
              return calcItemSize(d);
            })
            .on('end', repeat);
        })();

        // Construct tooltip
        var tooltip_html = '';
        tooltip_html += '<div class="header"><strong>' + (d.total ? this.formatTime(d.total) : 'No time') + ' tracked</strong></div>';
        tooltip_html += '<div>on ' + moment(d.date).format('dddd, MMM Do YYYY') + '</div><br>';

        // Add summary to the tooltip
        for (var i = 0; i < d.summary.length; i++) {
          tooltip_html += '<div><span><strong>' + d.summary[i].name + '</strong></span>';
          tooltip_html += '<span>' + this.formatTime(d.summary[i].value) + '</span></div>';
        };

        // Calculate tooltip position
        var x = calcItemX(d) + this.settings.item_size;
        if (this.settings.width - x < (this.settings.tooltip_width + this.settings.tooltip_padding * 3)) {
          x -= this.settings.tooltip_width + this.settings.tooltip_padding * 2;
        }
        var y = calcItemY(d) + this.settings.item_size;

        // Show tooltip
        this.tooltip.html(tooltip_html)
          .style('left', x + 'px')
          .style('top', y + 'px')
          .transition()
          .duration(this.settings.transition_duration / 2)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }

        // Set circle radius back to what it's supposed to be
        d3.select(this).transition()
          .duration(this.settings.transition_duration / 2)
          .ease(d3.easeLinear)
          .attr('x', function(d) {
            return calcItemX(d) + (this.settings.item_size - calcItemSize(d)) / 2;
          })
          .attr('y', function(d) {
            return calcItemY(d) + (this.settings.item_size - calcItemSize(d)) / 2;
          })
          .attr('width', function(d) {
            return calcItemSize(d);
          })
          .attr('height', function(d) {
            return calcItemSize(d);
          });

        // Hide tooltip
        this.hideTooltip();
      })
      .transition()
      .delay(function() {
        return (Math.cos(Math.PI * Math.random()) + 1) * this.settings.transition_duration;
      })
      .duration(function() {
        return this.settings.transition_duration;
      })
      .ease(d3.easeLinear)
      .style('opacity', 1)
      .call(function(transition, callback) {
        if (transition.empty()) {
          callback();
        }
        var n = 0;
        transition
          .each(function() {++n; })
          .on('end', function() {
            if (!--n) {
              callback.apply(this, arguments);
            }
          });
      }, function() {
        this.in_transition = false;
      });

    // Add month labels
    var month_labels = d3.timeMonths(start_of_year, end_of_year);
    var monthScale = d3.scaleLinear()
      .range([0, this.settings.width])
      .domain([0, month_labels.length]);
    this.labels.selectAll('.label-month').remove();
    this.labels.selectAll('.label-month')
      .data(month_labels)
      .enter()
      .append('text')
      .attr('class', 'label label-month')
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px';
      })
      .text(function(d) {
        return d.toLocaleDateString('en-us', { month: 'short' });
      })
      .attr('x', function(d, i) {
        return monthScale(i) + (monthScale(i) - monthScale(i - 1)) / 2;
      })
      .attr('y', this.settings.label_padding / 2)
      .on('mouseenter', function(d) {
        if (this.in_transition) { return; }

        var selected_month = moment(d);
        this.items.selectAll('.item-circle')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', function(d) {
            return moment(d.date).isSame(selected_month, 'month') ? 1 : 0.1;
          });
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-circle')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      })
      .on('click', function(d) {
        if (this.in_transition) { return; }

        // Check month data
        var month_data = this.props.data.filter(function(e) {
          return moment(d).startOf('month') <= moment(e.date) && moment(e.date) < moment(d).endOf('month');
        });

        // Don't transition if there is no data to show
        if (!month_data.length) { return; }

        // Set selected month to the one clicked on
        this.selected = { date: d };

        this.in_transition = true;

        // Hide tooltip
        this.hideTooltip();

        // Remove all year overview related items and labels
        this.removeYearOverview();

        // Redraw the chart
        this.overview = 'month';
        this.drawChart();
      });

    // Add day labels
    var day_labels = d3.timeDays(moment().startOf('week'), moment().endOf('week'));
    var dayScale = d3.scaleBand()
      .rangeRound([this.settings.label_padding, this.settings.height])
      .domain(day_labels.map(function(d) {
        return moment(d).weekday();
      }));
    this.labels.selectAll('.label-day').remove();
    this.labels.selectAll('.label-day')
      .data(day_labels)
      .enter()
      .append('text')
      .attr('class', 'label label-day')
      .attr('x', this.settings.label_padding / 3)
      .attr('y', function(d, i) {
        return dayScale(i) + dayScale.bandwidth() / 1.75;
      })
      .style('text-anchor', 'left')
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px';
      })
      .text(function(d) {
        return moment(d).format('dddd')[0];
      })
      .on('mouseenter', function(d) {
        if (this.in_transition) { return; }

        var selected_day = moment(d);
        this.items.selectAll('.item-circle')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', function(d) {
            return (moment(d.date).day() === selected_day.day()) ? 1 : 0.1;
          });
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-circle')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      });

    // Add button to switch back to previous overview
    this.drawButton();
  }


  /**
   * Draw month overview
   */
  drawMonthOverview() {
    // Add current overview to the history
    if (this.history[this.history.length - 1] !== this.overview) {
      this.history.push(this.overview);
    }

    // Define beginning and end of the month
    var start_of_month = moment(this.selected.date).startOf('month');
    var end_of_month = moment(this.selected.date).endOf('month');

    // Filter data down to the selected month
    var month_data = this.props.data.filter(function(d) {
      return start_of_month <= moment(d.date) && moment(d.date) < end_of_month;
    });
    var max_value = d3.max(month_data, function(d) {
      return d3.max(d.summary, function(d) {
        return d.value;
      });
    });

    // Define day labels and axis
    var day_labels = d3.timeDays(moment().startOf('week'), moment().endOf('week'));
    var dayScale = d3.scaleBand()
      .rangeRound([this.settings.label_padding, this.settings.height])
      .domain(day_labels.map(function(d) {
        return moment(d).weekday();
      }));

    // Define week labels and axis
    var week_labels = [start_of_month.clone()];
    while (start_of_month.week() !== end_of_month.week()) {
      week_labels.push(start_of_month.add(1, 'week').clone());
    }
    var weekScale = d3.scaleBand()
      .rangeRound([this.settings.label_padding, this.settings.width])
      .padding([0.05])
      .domain(week_labels.map(function(weekday) {
        return weekday.week();
      }));

    // Add month data items to the overview
    this.items.selectAll('.item-block-month').remove();
    var item_block = this.items.selectAll('.item-block-month')
      .data(month_data)
      .enter()
      .append('g')
      .attr('class', 'item item-block-month')
      .attr('width', function() {
        return (this.settings.width - this.settings.label_padding) / week_labels.length - this.settings.gutter * 5;
      })
      .attr('height', function() {
        return Math.min(dayScale.bandwidth(), this.settings.max_block_height);
      })
      .attr('transform', function(d) {
        return 'translate(' + weekScale(moment(d.date).week()) + ',' + ((dayScale(moment(d.date).weekday()) + dayScale.bandwidth() / 1.75) - 15) + ')';
      })
      .attr('total', function(d) {
        return d.total;
      })
      .attr('date', function(d) {
        return d.date;
      })
      .attr('offset', 0)
      .on('click', function(d) {
        if (this.in_transition) { return; }

        // Don't transition if there is no data to show
        if (d.total === 0) { return; }

        this.in_transition = true;

        // Set selected date to the one clicked on
        this.selected = d;

        // Hide tooltip
        this.hideTooltip();

        // Remove all month overview related items and labels
        this.removeMonthOverview();

        // Redraw the chart
        this.overview = 'day';
        this.drawChart();
      });

    var item_width = (this.settings.width - this.settings.label_padding) / week_labels.length - this.settings.gutter * 5;
    var itemScale = d3.scaleLinear()
      .rangeRound([0, item_width]);

    item_block.selectAll('.item-block-rect')
      .data(function(d) {
        return d.summary;
      })
      .enter()
      .append('rect')
      .attr('class', 'item item-block-rect')
      .attr('x', function(d) {
        var total = parseInt(d3.select(this.parentNode).attr('total'));
        var offset = parseInt(d3.select(this.parentNode).attr('offset'));
        itemScale.domain([0, total]);
        d3.select(this.parentNode).attr('offset', offset + itemScale(d.value));
        return offset;
      })
      .attr('width', function(d) {
        var total = parseInt(d3.select(this.parentNode).attr('total'));
        itemScale.domain([0, total]);
        return Math.max((itemScale(d.value) - this.settings.item_gutter), 1)
      })
      .attr('height', function() {
        return Math.min(dayScale.bandwidth(), this.settings.max_block_height);
      })
      .attr('fill', function(d) {
        var color = d3.scaleLinear()
          .range(['#ffffff', this.props.color])
          .domain([-0.15 * max_value, max_value]);
        return color(d.value) || '#ff4500';
      })
      .style('opacity', 0)
      .on('mouseover', function(d) {
        if (this.in_transition) { return; }

        // Get date from the parent node
        var date = new Date(d3.select(this.parentNode).attr('date'));

        // Construct tooltip
        var tooltip_html = '';
        tooltip_html += '<div class="header"><strong>' + d.name + '</strong></div><br>';
        tooltip_html += '<div><strong>' + (d.value ? this.formatTime(d.value) : 'No time') + ' tracked</strong></div>';
        tooltip_html += '<div>on ' + moment(date).format('dddd, MMM Do YYYY') + '</div>';

        // Calculate tooltip position
        var x = weekScale(moment(date).week()) + this.settings.tooltip_padding;
        while (this.settings.width - x < (this.settings.tooltip_width + this.settings.tooltip_padding * 3)) {
          x -= 10;
        }
        var y = dayScale(moment(date).weekday()) + this.settings.tooltip_padding * 2;

        // Show tooltip
        this.tooltip.html(tooltip_html)
          .style('left', x + 'px')
          .style('top', y + 'px')
          .transition()
          .duration(this.settings.transition_duration / 2)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }
        this.hideTooltip();
      })
      .transition()
      .delay(function() {
        return (Math.cos(Math.PI * Math.random()) + 1) * this.settings.transition_duration;
      })
      .duration(function() {
        return this.settings.transition_duration;
      })
      .ease(d3.easeLinear)
      .style('opacity', 1)
      .call(function(transition, callback) {
        if (transition.empty()) {
          callback();
        }
        var n = 0;
        transition
          .each(function() {++n; })
          .on('end', function() {
            if (!--n) {
              callback.apply(this, arguments);
            }
          });
      }, function() {
        this.in_transition = false;
      });

    // Add week labels
    this.labels.selectAll('.label-week').remove();
    this.labels.selectAll('.label-week')
      .data(week_labels)
      .enter()
      .append('text')
      .attr('class', 'label label-week')
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px';
      })
      .text(function(d) {
        return 'Week ' + d.week();
      })
      .attr('x', function(d) {
        return weekScale(d.week());
      })
      .attr('y', this.settings.label_padding / 2)
      .on('mouseenter', function(weekday) {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-block-month')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', function(d) {
            return (moment(d.date).week() === weekday.week()) ? 1 : 0.1;
          });
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-block-month')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      })
      .on('click', function(d) {
        if (this.in_transition) { return; }

        // Check week data
        var week_data = this.props.data.filter(function(e) {
          return d.startOf('week') <= moment(e.date) && moment(e.date) < d.endOf('week');
        });

        // Don't transition if there is no data to show
        if (!week_data.length) { return; }

        this.in_transition = true;

        // Set selected month to the one clicked on
        this.selected = { date: d };

        // Hide tooltip
        this.hideTooltip();

        // Remove all year overview related items and labels
        this.removeMonthOverview();

        // Redraw the chart
        this.overview = 'week';
        this.drawChart();
      });

    // Add day labels
    this.labels.selectAll('.label-day').remove();
    this.labels.selectAll('.label-day')
      .data(day_labels)
      .enter()
      .append('text')
      .attr('class', 'label label-day')
      .attr('x', this.settings.label_padding / 3)
      .attr('y', function(d, i) {
        return dayScale(i) + dayScale.bandwidth() / 1.75;
      })
      .style('text-anchor', 'left')
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px';
      })
      .text(function(d) {
        return moment(d).format('dddd')[0];
      })
      .on('mouseenter', function(d) {
        if (this.in_transition) { return; }

        var selected_day = moment(d);
        this.items.selectAll('.item-block-month')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', function(d) {
            return (moment(d.date).day() === selected_day.day()) ? 1 : 0.1;
          });
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-block-month')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      });

    // Add button to switch back to previous overview
    this.drawButton();
  }


  /**
   * Draw week overview
   */
  drawWeekOverview() {
    // Add current overview to the history
    if (this.history[this.history.length - 1] !== this.overview) {
      this.history.push(this.overview);
    }

    // Define beginning and end of the week
    var start_of_week = moment(this.selected.date).startOf('week');
    var end_of_week = moment(this.selected.date).endOf('week');

    // Filter data down to the selected week
    var week_data = this.props.data.filter(function(d) {
      return start_of_week <= moment(d.date) && moment(d.date) < end_of_week;
    });
    var max_value = d3.max(week_data, function(d) {
      return d3.max(d.summary, function(d) {
        return d.value;
      });
    });

    // Define day labels and axis
    var day_labels = d3.timeDays(moment().startOf('week'), moment().endOf('week'));
    var dayScale = d3.scaleBand()
      .rangeRound([this.settings.label_padding, this.settings.height])
      .domain(day_labels.map(function(d) {
        return moment(d).weekday();
      }));

    // Define week labels and axis
    var week_labels = [start_of_week];
    var weekScale = d3.scaleBand()
      .rangeRound([this.settings.label_padding, this.settings.width])
      .padding([0.01])
      .domain(week_labels.map(function(weekday) {
        return weekday.week();
      }));

    // Add week data items to the overview
    this.items.selectAll('.item-block-week').remove();
    var item_block = this.items.selectAll('.item-block-week')
      .data(week_data)
      .enter()
      .append('g')
      .attr('class', 'item item-block-week')
      .attr('width', function() {
        return (this.settings.width - this.settings.label_padding) / week_labels.length - this.settings.gutter * 5;
      })
      .attr('height', function() {
        return Math.min(dayScale.bandwidth(), this.settings.max_block_height);
      })
      .attr('transform', function(d) {
        return 'translate(' + weekScale(moment(d.date).week()) + ',' + ((dayScale(moment(d.date).weekday()) + dayScale.bandwidth() / 1.75) - 15) + ')';
      })
      .attr('total', function(d) {
        return d.total;
      })
      .attr('date', function(d) {
        return d.date;
      })
      .attr('offset', 0)
      .on('click', function(d) {
        if (this.in_transition) { return; }

        // Don't transition if there is no data to show
        if (d.total === 0) { return; }

        this.in_transition = true;

        // Set selected date to the one clicked on
        this.selected = d;

        // Hide tooltip
        this.hideTooltip();

        // Remove all week overview related items and labels
        this.removeWeekOverview();

        // Redraw the chart
        this.overview = 'day';
        this.drawChart();
      });

    var item_width = (this.settings.width - this.settings.label_padding) / week_labels.length - this.settings.gutter * 5;
    var itemScale = d3.scaleLinear()
      .rangeRound([0, item_width]);

    item_block.selectAll('.item-block-rect')
      .data(function(d) {
        return d.summary;
      })
      .enter()
      .append('rect')
      .attr('class', 'item item-block-rect')
      .attr('x', function(d) {
        var total = parseInt(d3.select(this.parentNode).attr('total'));
        var offset = parseInt(d3.select(this.parentNode).attr('offset'));
        itemScale.domain([0, total]);
        d3.select(this.parentNode).attr('offset', offset + itemScale(d.value));
        return offset;
      })
      .attr('width', function(d) {
        var total = parseInt(d3.select(this.parentNode).attr('total'));
        itemScale.domain([0, total]);
        return Math.max((itemScale(d.value) - this.settings.item_gutter), 1)
      })
      .attr('height', function() {
        return Math.min(dayScale.bandwidth(), this.settings.max_block_height);
      })
      .attr('fill', function(d) {
        var color = d3.scaleLinear()
          .range(['#ffffff', this.props.color])
          .domain([-0.15 * max_value, max_value]);
        return color(d.value) || '#ff4500';
      })
      .style('opacity', 0)
      .on('mouseover', function(d) {
        if (this.in_transition) { return; }

        // Get date from the parent node
        var date = new Date(d3.select(this.parentNode).attr('date'));

        // Construct tooltip
        var tooltip_html = '';
        tooltip_html += '<div class="header"><strong>' + d.name + '</strong></div><br>';
        tooltip_html += '<div><strong>' + (d.value ? this.formatTime(d.value) : 'No time') + ' tracked</strong></div>';
        tooltip_html += '<div>on ' + moment(date).format('dddd, MMM Do YYYY') + '</div>';

        // Calculate tooltip position
        var total = parseInt(d3.select(this.parentNode).attr('total'));
        itemScale.domain([0, total]);
        var x = parseInt(d3.select(this).attr('x')) + itemScale(d.value) / 4 + this.settings.tooltip_width / 4;
        while (this.settings.width - x < (this.settings.tooltip_width + this.settings.tooltip_padding * 3)) {
          x -= 10;
        }
        var y = dayScale(moment(date).weekday()) + this.settings.tooltip_padding * 1.5;

        // Show tooltip
        this.tooltip.html(tooltip_html)
          .style('left', x + 'px')
          .style('top', y + 'px')
          .transition()
          .duration(this.settings.transition_duration / 2)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }
        this.hideTooltip();
      })
      .transition()
      .delay(function() {
        return (Math.cos(Math.PI * Math.random()) + 1) * this.settings.transition_duration;
      })
      .duration(function() {
        return this.settings.transition_duration;
      })
      .ease(d3.easeLinear)
      .style('opacity', 1)
      .call(function(transition, callback) {
        if (transition.empty()) {
          callback();
        }
        var n = 0;
        transition
          .each(function() {++n; })
          .on('end', function() {
            if (!--n) {
              callback.apply(this, arguments);
            }
          });
      }, function() {
        this.in_transition = false;
      });

    // Add week labels
    this.labels.selectAll('.label-week').remove();
    this.labels.selectAll('.label-week')
      .data(week_labels)
      .enter()
      .append('text')
      .attr('class', 'label label-week')
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px';
      })
      .text(function(d) {
        return 'Week ' + d.week();
      })
      .attr('x', function(d) {
        return weekScale(d.week());
      })
      .attr('y', this.settings.label_padding / 2)
      .on('mouseenter', function(weekday) {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-block-week')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', function(d) {
            return (moment(d.date).week() === weekday.week()) ? 1 : 0.1;
          });
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-block-week')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      });

    // Add day labels
    this.labels.selectAll('.label-day').remove();
    this.labels.selectAll('.label-day')
      .data(day_labels)
      .enter()
      .append('text')
      .attr('class', 'label label-day')
      .attr('x', this.settings.label_padding / 3)
      .attr('y', function(d, i) {
        return dayScale(i) + dayScale.bandwidth() / 1.75;
      })
      .style('text-anchor', 'left')
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px';
      })
      .text(function(d) {
        return moment(d).format('dddd')[0];
      })
      .on('mouseenter', function(d) {
        if (this.in_transition) { return; }

        var selected_day = moment(d);
        this.items.selectAll('.item-block-week')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', function(d) {
            return (moment(d.date).day() === selected_day.day()) ? 1 : 0.1;
          });
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-block-week')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      });

    // Add button to switch back to previous overview
    this.drawButton();
  }


  /**
   * Draw day overview
   */
  drawDayOverview() {
    // Add current overview to the history
    if (this.history[this.history.length - 1] !== this.overview) {
      this.history.push(this.overview);
    }

    // Initialize selected date to today if it was not set
    if (!Object.keys(this.selected).length) {
      this.selected = this.props.data[this.props.data.length - 1];
    }

    var project_labels = this.selected.summary.map(function(project) {
      return project.name;
    });
    var projectScale = d3.scaleBand()
      .rangeRound([this.settings.label_padding, this.settings.height])
      .domain(project_labels);

    var itemScale = d3.scaleTime()
      .range([this.settings.label_padding * 2, this.settings.width])
      .domain([moment(this.selected.date).startOf('day'), moment(this.selected.date).endOf('day')]);
    this.items.selectAll('.item-block').remove();
    this.items.selectAll('.item-block')
      .data(this.selected.details)
      .enter()
      .append('rect')
      .attr('class', 'item item-block')
      .attr('x', function(d) {
        return itemScale(moment(d.date));
      })
      .attr('y', function(d) {
        return (projectScale(d.name) + projectScale.bandwidth() / 2) - 15;
      })
      .attr('width', function(d) {
        var end = itemScale(d3.timeSecond.offset(moment(d.date), d.value));
        return Math.max((end - itemScale(moment(d.date))), 1);
      })
      .attr('height', function() {
        return Math.min(projectScale.bandwidth(), this.settings.max_block_height);
      })
      .attr('fill', function() {
        return this.props.color;
      })
      .style('opacity', 0)
      .on('mouseover', function(d) {
        if (this.in_transition) { return; }

        // Construct tooltip
        var tooltip_html = '';
        tooltip_html += '<div class="header"><strong>' + d.name + '</strong><div><br>';
        tooltip_html += '<div><strong>' + (d.value ? this.formatTime(d.value) : 'No time') + ' tracked</strong></div>';
        tooltip_html += '<div>on ' + moment(d.date).format('dddd, MMM Do YYYY HH:mm') + '</div>';

        // Calculate tooltip position
        var x = d.value * 100 / (60 * 60 * 24) + itemScale(moment(d.date));
        while (this.settings.width - x < (this.settings.tooltip_width + this.settings.tooltip_padding * 3)) {
          x -= 10;
        }
        var y = projectScale(d.name) + projectScale.bandwidth() / 2 + this.settings.tooltip_padding / 2;

        // Show tooltip
        this.tooltip.html(tooltip_html)
          .style('left', x + 'px')
          .style('top', y + 'px')
          .transition()
          .duration(this.settings.transition_duration / 2)
          .ease(d3.easeLinear)
          .style('opacity', 1);
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }
        this.hideTooltip();
      })
      .on('click', function(d) {
        if (!!this.props.handler && typeof this.props.handler == 'function') {
          this.props.handler(d);
        }
      })
      .transition()
      .delay(function() {
        return (Math.cos(Math.PI * Math.random()) + 1) * this.settings.transition_duration;
      })
      .duration(function() {
        return this.settings.transition_duration;
      })
      .ease(d3.easeLinear)
      .style('opacity', 0.5)
      .call(function(transition, callback) {
        if (transition.empty()) {
          callback();
        }
        var n = 0;
        transition
          .each(function() {++n; })
          .on('end', function() {
            if (!--n) {
              callback.apply(this, arguments);
            }
          });
      }, function() {
        this.in_transition = false;
      });

    // Add time labels
    var timeLabels = d3.timeHours(
      moment(this.selected.date).startOf('day'),
      moment(this.selected.date).endOf('day')
    );
    var timeScale = d3.scaleTime()
      .range([this.settings.label_padding * 2, this.settings.width])
      .domain([0, timeLabels.length]);
    this.labels.selectAll('.label-time').remove();
    this.labels.selectAll('.label-time')
      .data(timeLabels)
      .enter()
      .append('text')
      .attr('class', 'label label-time')
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px';
      })
      .text(function(d) {
        return moment(d).format('HH:mm');
      })
      .attr('x', function(d, i) {
        return timeScale(i);
      })
      .attr('y', this.settings.label_padding / 2)
      .on('mouseenter', function(d) {
        if (this.in_transition) { return; }

        var selected = itemScale(moment(d));
        this.items.selectAll('.item-block')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', function(d) {
            var start = itemScale(moment(d.date));
            var end = itemScale(moment(d.date).add(d.value, 'seconds'));
            return (selected >= start && selected <= end) ? 1 : 0.1;
          });
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-block')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', 0.5);
      });

    // Add project labels
    this.labels.selectAll('.label-project').remove();
    this.labels.selectAll('.label-project')
      .data(project_labels)
      .enter()
      .append('text')
      .attr('class', 'label label-project')
      .attr('x', this.settings.gutter)
      .attr('y', function(d) {
        return projectScale(d) + projectScale.bandwidth() / 2;
      })
      .attr('min-height', function() {
        return projectScale.bandwidth();
      })
      .style('text-anchor', 'left')
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px';
      })
      .text(function(d) {
        return d;
      })
      .each(function() {
        var obj = d3.select(this),
          text_length = obj.node().getComputedTextLength(),
          text = obj.text();
        while (text_length > (this.settings.label_padding * 1.5) && text.length > 0) {
          text = text.slice(0, -1);
          obj.text(text + '...');
          text_length = obj.node().getComputedTextLength();
        }
      })
      .on('mouseenter', function(project) {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-block')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', function(d) {
            return (d.name === project) ? 1 : 0.1;
          });
      })
      .on('mouseout', function() {
        if (this.in_transition) { return; }

        this.items.selectAll('.item-block')
          .transition()
          .duration(this.settings.transition_duration)
          .ease(d3.easeLinear)
          .style('opacity', 0.5);
      });

    // Add button to switch back to previous overview
    this.drawButton();
  }


  /**
   * Draw the button for navigation purposes
   */
  drawButton() {
    this.buttons.selectAll('.button').remove();
    var button = this.buttons.append('g')
      .attr('class', 'button button-back')
      .style('opacity', 0)
      .on('click', function() {
        if (this.in_transition) { return; }

        // Set transition boolean
        this.in_transition = true;

        // Clean the canvas from whichever overview type was on
        if (this.overview === 'year') {
          this.removeYearOverview();
        } else if (this.overview === 'month') {
          this.removeMonthOverview();
        } else if (this.overview === 'week') {
          this.removeWeekOverview();
        } else if (this.overview === 'day') {
          this.removeDayOverview();
        }

        // Redraw the chart
        this.history.pop();
        this.overview = this.history.pop();
        this.drawChart();
      });
    button.append('circle')
      .attr('cx', this.settings.label_padding / 2.25)
      .attr('cy', this.settings.label_padding / 2.5)
      .attr('r', this.settings.item_size / 2);
    button.append('text')
      .attr('x', this.settings.label_padding / 2.25)
      .attr('y', this.settings.label_padding / 2.5)
      .attr('dy', function() {
        return Math.floor(this.settings.width / 100) / 3;
      })
      .attr('font-size', function() {
        return Math.floor(this.settings.label_padding / 3) + 'px';
      })
      .html('&#x2190;');
    button.transition()
      .duration(this.settings.transition_duration)
      .ease(d3.easeLinear)
      .style('opacity', 1);
  }


  /**
   * Transition and remove items and labels related to global overview
   */
  removeGlobalOverview() {
    this.items.selectAll('.item-block-year')
      .transition()
      .duration(this.settings.transition_duration)
      .ease(d3.easeLinear)
      .style('opacity', 0)
      .remove();
    this.labels.selectAll('.label-year').remove();
  }


  /**
   * Transition and remove items and labels related to year overview
   */
  removeYearOverview() {
    this.items.selectAll('.item-circle')
      .transition()
      .duration(this.settings.transition_duration)
      .ease(d3.easeLinear)
      .style('opacity', 0)
      .remove();
    this.labels.selectAll('.label-day').remove();
    this.labels.selectAll('.label-month').remove();
    this.hideBackButton();
  }


  /**
   * Transition and remove items and labels related to month overview
   */
  removeMonthOverview() {
    this.items.selectAll('.item-block-month').selectAll('.item-block-rect')
      .transition()
      .duration(this.settings.transition_duration)
      .ease(d3.easeLinear)
      .style('opacity', 0)
      .attr('x', function(d, i) {
        return (i % 2 === 0) ? -this.settings.width / 3 : this.settings.width / 3;
      })
      .remove();
    this.labels.selectAll('.label-day').remove();
    this.labels.selectAll('.label-week').remove();
    this.hideBackButton();
  }


  /**
   * Transition and remove items and labels related to week overview
   */
  removeWeekOverview() {
    this.items.selectAll('.item-block-week').selectAll('.item-block-rect')
      .transition()
      .duration(this.settings.transition_duration)
      .ease(d3.easeLinear)
      .style('opacity', 0)
      .attr('x', function(d, i) {
        return (i % 2 === 0) ? -this.settings.width / 3 : this.settings.width / 3;
      })
      .remove();
    this.labels.selectAll('.label-day').remove();
    this.labels.selectAll('.label-week').remove();
    this.hideBackButton();
  }


  /**
   * Transition and remove items and labels related to daily overview
   */
  removeDayOverview() {
    this.items.selectAll('.item-block')
      .transition()
      .duration(this.settings.transition_duration)
      .ease(d3.easeLinear)
      .style('opacity', 0)
      .attr('x', function(d, i) {
        return (i % 2 === 0) ? -this.settings.width / 3 : this.settings.width / 3;
      })
      .remove();
    this.labels.selectAll('.label-time').remove();
    this.labels.selectAll('.label-project').remove();
    this.hideBackButton();
  }



  /**
   * Helper function to hide the tooltip
   */
  hideTooltip() {
    this.tooltip.transition()
      .duration(this.settings.transition_duration / 2)
      .ease(d3.easeLinear)
      .style('opacity', 0);
  }


  /**
   * Helper function to hide the back button
   */
  hideBackButton() {
    this.buttons.selectAll('.button')
      .transition()
      .duration(this.settings.transition_duration)
      .ease(d3.easeLinear)
      .style('opacity', 0)
      .remove();
  }


  /**
   * Helper function to convert seconds to a human readable format
   * @param seconds Integer
   */
  formatTime(seconds) {
    var hours = Math.floor(seconds / 3600);
    var minutes = Math.floor((seconds - (hours * 3600)) / 60);
    var time = '';
    if (hours > 0) {
      time += hours === 1 ? '1 hour ' : hours + ' hours ';
    }
    if (minutes > 0) {
      time += minutes === 1 ? '1 minute' : minutes + ' minutes';
    }
    if (hours === 0 && minutes === 0) {
      time = Math.round(seconds) + ' seconds';
    }
    return time;
  }


  render() {
    return (
      <div id="calendar-heatmap"></div>
    )
  }
}

CalendarHeatmap.defaultProps = {
  data: [],
  overview: 'year',
  color: '#ff4500',
  handler: undefined,
}

export default CalendarHeatmap
